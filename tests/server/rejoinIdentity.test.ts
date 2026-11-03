/**
 * Rejoin must prove identity. Previously a slot was matched by player NAME whenever the
 * request had no guestSessionId — anyone who knew the room code and a name could take over a
 * logged-in player's seat (and their payout).
 */
import { describe, it, expect } from 'vitest';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';
import { issueToken } from '../../server/api/middleware.js';

function setup() {
  const rooms = new RoomManager();
  const io: any = { to: () => ({ emit: () => {} }) };
  const session = new SessionManager(io, rooms, {} as any);
  rooms.createRoom('sA', 'ID01', 'Alice', undefined);
  rooms.joinRoom('sB', 'ID01', 'Bob', 'guest-bob-uuid');
  rooms.setPlayerAuth('sA', 'ID01', 42);                 // Alice is logged in as player #42
  const sock = (id: string) => {
    const out: Array<{ ev: string; data: any }> = [];
    return { id, out, emit: (ev: string, data: any) => out.push({ ev, data }), join: () => {}, to: () => ({ emit: () => {} }) } as any;
  };
  return { rooms, session, sock };
}
const tokenFor = (playerId: number) => issueToken({ playerId, wallet: null, email: null, authProvider: 'email', accountTier: 1 });

describe('Rejoin identity', () => {
  it("a name alone cannot take a logged-in player's seat", () => {
    const { rooms, session, sock } = setup();
    const attacker = sock('evil');
    session.handleRejoin(attacker, 'ID01', 'Alice');
    expect(attacker.out.map((o: any) => o.ev)).toContain('error');
    expect(rooms.getRoom('ID01')!.players[0].id).toBe('sA');
    rooms.dispose();
  });

  it('a token for a different account is rejected', () => {
    const { rooms, session, sock } = setup();
    const attacker = sock('evil');
    session.handleRejoin(attacker, 'ID01', 'Alice', undefined, tokenFor(7));
    expect(attacker.out.map((o: any) => o.ev)).toContain('error');
    rooms.dispose();
  });

  it('the right token rejoins the logged-in seat', () => {
    const { rooms, session, sock } = setup();
    const alice = sock('sA2');
    session.handleRejoin(alice, 'ID01', 'Alice', undefined, tokenFor(42));
    expect(alice.out.find((o: any) => o.ev === 'rejoinSuccess')?.data.playerIndex).toBe(0);
    rooms.dispose();
  });

  it("a guest seat needs the guest's session id, not just the name", () => {
    const { rooms, session, sock } = setup();
    const attacker = sock('evil');
    session.handleRejoin(attacker, 'ID01', 'Bob');
    expect(attacker.out.map((o: any) => o.ev)).toContain('error');
    const bob = sock('sB2');
    session.handleRejoin(bob, 'ID01', 'Bob', 'guest-bob-uuid');
    expect(bob.out.find((o: any) => o.ev === 'rejoinSuccess')?.data.playerIndex).toBe(1);
    rooms.dispose();
  });
});
