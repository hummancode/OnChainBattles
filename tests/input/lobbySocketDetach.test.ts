/** Detaching one scene's LobbySocketManager used removeAllListeners → it also silenced the
 *  next scene's manager (errors/state went nowhere, or to a dead scene's callbacks). */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import SocketManager from '../../src/network/SocketManager';
import { LobbySocketManager } from '../../src/lobby/LobbySocketManager';

describe('LobbySocketManager.detach', () => {
  it("only removes its own listeners", () => {
    const sock = new EventEmitter() as any;
    const spy = vi.spyOn(SocketManager, 'getSocket').mockReturnValue(sock);
    const oldErr = vi.fn(); const newErr = vi.fn();
    const hub = new LobbySocketManager({ onError: oldErr });
    hub.attach();
    const lobby = new LobbySocketManager({ onError: newErr });
    lobby.attach();
    hub.detach();                       // old scene shuts down after the new one attached
    sock.emit('lobby:error', { message: 'Room is full' });
    expect(oldErr).not.toHaveBeenCalled();
    expect(newErr).toHaveBeenCalledWith('Room is full');
    lobby.detach();
    expect(sock.listenerCount('lobby:error')).toBe(0);
    spy.mockRestore();
  });
});
