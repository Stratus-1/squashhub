import sys

with open('src/components/league-games/FixturesTab.tsx', 'r') as f:
    content = f.read()

# Fix 2: Bye Date Cascade & playableFixtures replacement
old_block = """          const playableFixtures = ((fixtures ?? []) as Array<{ id: string; start_time: string | null; booking_id: string | null; fixture_date: string | null; court_id: number | null; away_team_code: string }>).filter(
            (f) => f.away_team_code !== "__BYE__",
          );"""

new_block = """          const allFixtures = (fixtures ?? []) as Array<{ id: string; start_time: string | null; booking_id: string | null; fixture_date: string | null; court_id: number | null; away_team_code: string }>;
          const playableFixtures = allFixtures.filter(f => f.away_team_code !== "__BYE__");"""

content = content.replace(old_block, new_block)

# Fix loop
old_loop = """          for (const f of playableFixtures) {"""
new_loop = """          for (const f of allFixtures) {
            const isBye = f.away_team_code === "__BYE__";"""

# Be careful, there might be multiple loops or different formatting
# The previous script might have already messed it up slightly, let's look at what's there now.
