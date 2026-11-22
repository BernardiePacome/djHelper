import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ActivePlayers {
  private readonly fadeOuts = new Map<string, () => void>();

  // Marks the player as playing and fades out every other playing player; returns whether any was playing.
  public activate(playerId: string, fadeOut: () => void): boolean {
    const others = [...this.fadeOuts].filter(([id]) => id !== playerId);
    this.fadeOuts.set(playerId, fadeOut);
    others.forEach(([, fadeOutOther]) => fadeOutOther());
    return others.length > 0;
  }

  public deactivate(playerId: string): void {
    this.fadeOuts.delete(playerId);
  }
}
