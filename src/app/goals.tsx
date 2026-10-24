import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { GoalRow } from '@/components/GoalRow';
import { Button, Empty, Loading, Rule, Screen, Section, TextLink } from '@/components/ui';
import { useGoals } from '@/hooks/queries';
import { toIsoDate } from '@/services/dates';
import { space } from '@/theme/tokens';

export default function GoalsScreen() {
  const [showArchived, setShowArchived] = useState(false);
  const goals = useGoals(true);
  const today = toIsoDate(new Date());

  if (!goals.data) return <Loading rows={3} />;
  const active = goals.data.filter((g) => !g.archived);
  const archived = goals.data.filter((g) => g.archived);
  const open = (id: number) => router.push({ pathname: '/goal', params: { id: String(id) } });

  return (
    <Screen testID="goals-screen">
      <View style={{ padding: space.lg }}>
        <Button testID="add-goal" label="Add a goal" onPress={() => router.push('/goal')} />
      </View>
      {active.length === 0 ? (
        <Empty
          icon="piggy-bank-outline"
          title="No goals yet"
          text="A goal is an amount you are saving towards, such as a trip or an emergency fund. Add money to it as you set it aside, and Nickel works out how much a month gets you there on time."
        />
      ) : (
        active.map((g, i) => (
          <View key={g.id}>
            {i > 0 && <Rule inset={space.lg + 44} />}
            <GoalRow goal={g} today={today} onPress={() => open(g.id)} />
          </View>
        ))
      )}
      {archived.length > 0 && (
        <Section
          title="Archived"
          action={
            <TextLink
              label={showArchived ? 'Hide' : `Show ${archived.length}`}
              onPress={() => setShowArchived(!showArchived)}
            />
          }
        >
          {showArchived &&
            archived.map((g, i) => (
              <View key={g.id}>
                {i > 0 && <Rule inset={space.lg + 44} />}
                <GoalRow goal={g} today={today} onPress={() => open(g.id)} />
              </View>
            ))}
        </Section>
      )}
    </Screen>
  );
}
