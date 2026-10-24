import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryChip';
import { MoneyText } from '@/components/MoneyText';
import { Button, Empty, Loading } from '@/components/ui';
import { track } from '@/events/track';
import { useCategories, useMarkReviewSeen, useReview } from '@/hooks/queries';
import { useUiStore } from '@/hooks/uiStore';
import { addMonthsToMonth } from '@/services/dates';
import { formatPeriod, weekdayName } from '@/services/format';
import { formatCents } from '@/services/money';
import { reviewText, type ReviewCard } from '@/services/review';
import { radius, space, useTheme } from '@/theme/tokens';
import type { Category } from '@/types/domain';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const FALLBACK = { icon: 'dots-horizontal', color: '#616161' };

function Card({
  eyebrow,
  icon,
  children,
  width,
}: {
  eyebrow: string;
  icon: IconName;
  children: ReactNode;
  width: number;
}) {
  const theme = useTheme();
  return (
    <View style={{ width, paddingHorizontal: space.lg }}>
      <View
        accessible
        style={{
          flex: 1,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: theme.rule,
          backgroundColor: theme.surface,
          padding: space.xl,
          gap: space.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <MaterialCommunityIcons name={icon} size={20} color={theme.brand} />
          <AppText variant="small" tone="brand" weight="medium">
            {eyebrow.toUpperCase()}
          </AppText>
        </View>
        {children}
      </View>
    </View>
  );
}

function CardBody({
  card,
  previous,
  catById,
  locale,
}: {
  card: ReviewCard;
  previous: string;
  catById: Map<number, Category>;
  locale: string;
}) {
  switch (card.kind) {
    case 'total':
      return (
        <>
          <AppText variant="title">You spent</AppText>
          <MoneyText cents={card.spentCents} variant="display" weight="bold" />
          {card.changePercent !== null && (
            <AppText tone="textMuted">
              {card.changePercent === 0
                ? `The same as ${previous}.`
                : `${Math.abs(card.changePercent)}% ${card.changePercent > 0 ? 'more' : 'less'} than ${previous}.`}
            </AppText>
          )}
          {card.incomeCents > 0 && (
            <AppText tone="textMuted">
              Income <MoneyText tone="textMuted" cents={card.incomeCents} />
              {' · '}
              {card.netCents >= 0 ? 'kept ' : 'spent '}
              <MoneyText
                tone={card.netCents >= 0 ? 'income' : 'problem'}
                weight="medium"
                cents={Math.abs(card.netCents)}
              />
              {card.netCents >= 0 ? '' : ' more than came in'}
            </AppText>
          )}
        </>
      );
    case 'change': {
      const cat = catById.get(card.categoryId);
      return (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <CategoryIcon category={cat ?? FALLBACK} size={40} />
            <AppText variant="title" weight="bold" style={{ flex: 1 }}>
              {cat?.name ?? 'A category'}
            </AppText>
          </View>
          <AppText variant="title">
            <MoneyText variant="title" weight="bold" cents={Math.abs(card.deltaCents)} />{' '}
            {card.deltaCents > 0 ? 'more' : 'less'} than {previous}
          </AppText>
          <AppText tone="textMuted">
            <MoneyText tone="textMuted" cents={card.prevCents} /> then,{' '}
            <MoneyText tone="textMuted" cents={card.nowCents} /> now.
          </AppText>
        </>
      );
    }
    case 'merchant':
      return (
        <>
          <AppText variant="display" weight="bold" numberOfLines={2}>
            {card.merchant}
          </AppText>
          <AppText tone="textMuted">
            {card.count} {card.count === 1 ? 'purchase' : 'purchases'},{' '}
            <MoneyText tone="textMuted" cents={card.spentCents} /> in total.
          </AppText>
        </>
      );
    case 'budgets': {
      const over = card.overCategoryId === null ? null : catById.get(card.overCategoryId);
      return (
        <>
          <AppText variant="display" weight="bold">
            {card.kept} of {card.total}
          </AppText>
          <AppText variant="title">{card.total === 1 ? 'budget kept' : 'budgets kept'}</AppText>
          {over && (
            <AppText tone="textMuted">
              {over.name} went <MoneyText tone="problem" weight="medium" cents={card.overByCents} />{' '}
              over its limit.
            </AppText>
          )}
        </>
      );
    }
    case 'weekday':
      return (
        <>
          <AppText variant="display" weight="bold">
            {weekdayName(card.weekday, locale)}
          </AppText>
          <AppText tone="textMuted">
            {card.sharePercent}% of the period&apos;s spending,{' '}
            <MoneyText tone="textMuted" cents={card.spentCents} />.
          </AppText>
        </>
      );
    case 'largest': {
      const cat = catById.get(card.categoryId);
      return (
        <>
          <MoneyText cents={-card.amountCents} variant="display" weight="bold" />
          <AppText variant="title" numberOfLines={2}>
            {card.title || cat?.name || 'Expense'}
          </AppText>
          <Button
            label="Open transaction"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/transaction', params: { id: String(card.id) } })
            }
          />
        </>
      );
    }
    case 'goals':
      return (
        <>
          <MoneyText cents={card.contributedCents} variant="display" weight="bold" tone="income" />
          <AppText variant="title">set aside for goals</AppText>
        </>
      );
  }
}

const META: Record<ReviewCard['kind'], { eyebrow: string; icon: IconName }> = {
  total: { eyebrow: 'The period', icon: 'calendar-month-outline' },
  change: { eyebrow: 'Biggest change', icon: 'swap-vertical' },
  merchant: { eyebrow: 'Most spent at', icon: 'storefront-outline' },
  budgets: { eyebrow: 'Budgets', icon: 'chart-donut' },
  weekday: { eyebrow: 'Busiest day', icon: 'calendar-week' },
  largest: { eyebrow: 'Largest expense', icon: 'receipt' },
  goals: { eyebrow: 'Goals', icon: 'flag-checkered' },
};

export default function ReviewScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ month?: string }>();
  const storeMonth = useUiStore((s) => s.month);
  const month = params.month ?? storeMonth;
  const startDay = useUiStore((s) => s.periodStartDay);
  const locale = useUiStore((s) => s.locale);
  const symbol = useUiStore((s) => s.currencySymbol);
  const review = useReview(month);
  const categories = useCategories(true);
  const markSeen = useMarkReviewSeen();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const markSeenMutate = markSeen.mutate;
  useEffect(() => {
    markSeenMutate(month);
    track('feature_used', { feature: 'review_opened', month });
  }, [month, markSeenMutate]);

  if (!review.data || !categories.data) return <Loading rows={3} />;
  const cards = review.data.cards;
  const catById = new Map(categories.data.map((c) => [c.id, c]));
  const period = formatPeriod(month, startDay, locale);
  const previous = formatPeriod(addMonthsToMonth(month, -1), startDay, locale);

  const share = () =>
    Share.share({
      message: reviewText(cards, {
        period,
        money: (c) => formatCents(c, { symbol }),
        category: (id) => catById.get(id)?.name ?? 'A category',
        weekday: (d) => weekdayName(d, locale),
      }),
    }).catch(() => undefined);

  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }} testID="review-screen">
      <Stack.Screen options={{ title: period }} />
      {cards.length === 0 ? (
        <Empty
          icon="calendar-blank-outline"
          title="Nothing to review"
          text="There are no transactions in this period."
        />
      ) : (
        <>
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            contentContainerStyle={{ paddingVertical: space.xl }}
            style={{ maxHeight: Math.min(520, height * 0.62) }}
          >
            {cards.map((card, i) => (
              <Card key={`${card.kind}-${i}`} width={width} {...META[card.kind]}>
                <CardBody card={card} previous={previous} catById={catById} locale={locale} />
              </Card>
            ))}
          </ScrollView>
          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm }}
            accessibilityRole="adjustable"
            accessibilityLabel={`Card ${page + 1} of ${cards.length}`}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) =>
              goTo(
                e.nativeEvent.actionName === 'increment'
                  ? Math.min(cards.length - 1, page + 1)
                  : Math.max(0, page - 1),
              )
            }
          >
            {cards.map((card, i) => (
              <Pressable
                key={`${card.kind}-dot-${i}`}
                onPress={() => goTo(i)}
                hitSlop={8}
                importantForAccessibility="no"
                style={{
                  width: i === page ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === page ? theme.brand : theme.rule,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, padding: space.lg }}>
            <Button
              label={page < cards.length - 1 ? 'Next' : 'Done'}
              onPress={() => (page < cards.length - 1 ? goTo(page + 1) : router.back())}
              style={{ flex: 1 }}
              testID="review-next"
            />
            <Button label="Share" variant="secondary" onPress={share} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </View>
  );
}
