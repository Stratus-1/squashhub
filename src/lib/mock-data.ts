export interface Player {
  id: string;
  name: string;
  rank: number | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  avatar: string;
  joinDate: string;
}

export interface Booking {
  id: string;
  courtId: number;
  courtName: string;
  playerId: string;
  playerName: string;
  startTime: string;
  endTime: string;
  date: string;
}

export interface Challenge {
  id: string;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  status: "pending" | "accepted" | "declined" | "completed";
  createdAt: string;
  proposedDate?: string;
}

export interface Match {
  id: string;
  playerA: string;
  playerAName: string;
  playerB: string;
  playerBName: string;
  score: string;
  winnerId: string;
  date: string;
  confirmed: boolean;
}

export const players: Player[] = [
  { id: "1", name: "James van der Berg", rank: 1, matchesPlayed: 24, wins: 19, losses: 5, avatar: "JV", joinDate: "2024-01-15" },
  { id: "2", name: "Sarah Mitchell", rank: 2, matchesPlayed: 22, wins: 17, losses: 5, avatar: "SM", joinDate: "2024-02-01" },
  { id: "3", name: "Mike Thompson", rank: 3, matchesPlayed: 20, wins: 14, losses: 6, avatar: "MT", joinDate: "2024-01-20" },
  { id: "4", name: "Lisa Chen", rank: 4, matchesPlayed: 18, wins: 12, losses: 6, avatar: "LC", joinDate: "2024-03-10" },
  { id: "5", name: "David Botha", rank: 5, matchesPlayed: 16, wins: 10, losses: 6, avatar: "DB", joinDate: "2024-02-15" },
  { id: "6", name: "Emma Wilson", rank: 6, matchesPlayed: 15, wins: 9, losses: 6, avatar: "EW", joinDate: "2024-04-01" },
  { id: "7", name: "Ryan Jacobs", rank: 7, matchesPlayed: 12, wins: 7, losses: 5, avatar: "RJ", joinDate: "2024-03-25" },
  { id: "8", name: "Thandi Nkosi", rank: 8, matchesPlayed: 10, wins: 5, losses: 5, avatar: "TN", joinDate: "2024-05-01" },
];

export const todayBookings: Booking[] = [
  { id: "b1", courtId: 1, courtName: "Court 1", playerId: "1", playerName: "James van der Berg", startTime: "08:00", endTime: "09:00", date: "2026-03-05" },
  { id: "b2", courtId: 2, courtName: "Court 2", playerId: "3", playerName: "Mike Thompson", startTime: "08:00", endTime: "09:00", date: "2026-03-05" },
  { id: "b3", courtId: 1, courtName: "Court 1", playerId: "2", playerName: "Sarah Mitchell", startTime: "10:00", endTime: "11:00", date: "2026-03-05" },
  { id: "b4", courtId: 2, courtName: "Court 2", playerId: "5", playerName: "David Botha", startTime: "17:00", endTime: "18:00", date: "2026-03-05" },
];

export const recentChallenges: Challenge[] = [
  { id: "c1", challengerId: "4", challengerName: "Lisa Chen", opponentId: "2", opponentName: "Sarah Mitchell", status: "pending", createdAt: "2026-03-04", proposedDate: "2026-03-07" },
  { id: "c2", challengerId: "6", challengerName: "Emma Wilson", opponentId: "4", opponentName: "Lisa Chen", status: "accepted", createdAt: "2026-03-03", proposedDate: "2026-03-06" },
  { id: "c3", challengerId: "7", challengerName: "Ryan Jacobs", opponentId: "5", opponentName: "David Botha", status: "completed", createdAt: "2026-03-01" },
];

export const recentMatches: Match[] = [
  { id: "m1", playerA: "1", playerAName: "James van der Berg", playerB: "3", playerBName: "Mike Thompson", score: "3-1", winnerId: "1", date: "2026-03-04", confirmed: true },
  { id: "m2", playerA: "2", playerAName: "Sarah Mitchell", playerB: "5", playerBName: "David Botha", score: "3-0", winnerId: "2", date: "2026-03-03", confirmed: true },
  { id: "m3", playerA: "7", playerAName: "Ryan Jacobs", playerB: "5", playerBName: "David Botha", score: "3-2", winnerId: "7", date: "2026-03-01", confirmed: false },
];

export const timeSlots = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00",
];

export const announcements = [
  { id: "a1", title: "Court 2 Maintenance", message: "Court 2 will be closed for maintenance on March 10th.", date: "2026-03-03" },
  { id: "a2", title: "Spring Tournament", message: "Sign up for the Spring Tournament starting March 20th!", date: "2026-03-01" },
];
