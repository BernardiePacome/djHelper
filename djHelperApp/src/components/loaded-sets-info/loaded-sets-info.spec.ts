import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LoadedSetsInfo } from './loaded-sets-info';

describe('LoadedSetsInfo', () => {
  it('renders the names of the supplied saved sets', () => {
    const fixture = TestBed.createComponent(LoadedSetsInfo);
    fixture.componentRef.setInput('sets', [
      { id: 'set-1', name: 'First set' },
      { id: 'set-2', name: 'Second set' },
    ]);

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Set(s) already loaded:');
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('li'), (item: Element) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['First set', 'Second set']);
  });

  it('highlights only the playing set and shows its play icon', () => {
    const fixture = TestBed.createComponent(LoadedSetsInfo);
    fixture.componentRef.setInput('sets', [
      { id: 'set-1', name: 'First set' },
      { id: 'set-2', name: 'Second set' },
    ]);
    fixture.componentRef.setInput('loadedSetIds', ['set-2']);
    fixture.componentRef.setInput('playingSetId', 'set-2');

    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('li');
    expect(rows[0].classList.contains('current-set')).toBe(false);
    expect(rows[0].querySelector('svg.current-set-icon')).toBeNull();
    expect(rows[1].classList.contains('current-set')).toBe(true);
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    expect(rows[1].querySelector('svg.current-set-icon')).not.toBeNull();
  });

  it('greys out only unloaded sets and updates when a set is loaded or removed', () => {
    const fixture = TestBed.createComponent(LoadedSetsInfo);
    fixture.componentRef.setInput('sets', [
      { id: 'set-1', name: 'First set' },
      { id: 'set-2', name: 'Second set' },
    ]);
    fixture.componentRef.setInput('loadedSetIds', ['set-1']);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('li');
    expect(rows[0].classList.contains('not-loaded')).toBe(false);
    expect(rows[1].classList.contains('not-loaded')).toBe(true);

    fixture.componentRef.setInput('loadedSetIds', ['set-2']);
    fixture.detectChanges();

    expect(rows[0].classList.contains('not-loaded')).toBe(true);
    expect(rows[1].classList.contains('not-loaded')).toBe(false);
  });
});
