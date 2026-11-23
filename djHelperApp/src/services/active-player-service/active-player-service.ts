import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ActivePlayerService {
  private readonly fadeOuts = new Map<string, () => void>();

  // Marks the player as playing and fades out every other playing player; returns whether any was playing.
  public activate(playerId: string, fadeOut: () => void): boolean {
    const otherPlayers = [...this.fadeOuts].filter(([id]) => id !== playerId);
    this.fadeOuts.set(playerId, fadeOut);
    otherPlayers.forEach(([, fadeOutOther]) => fadeOutOther());
    
    return otherPlayers.length > 0;
  }

  public deactivate(playerId: string): void {
    this.fadeOuts.delete(playerId);
  }
}
