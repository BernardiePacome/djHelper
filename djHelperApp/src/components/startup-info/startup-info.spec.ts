import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StartupInfo } from './startup-info';

describe('StartupInfo', () => {
  it('renders the names of the supplied saved sets', () => {
    const fixture = TestBed.createComponent(StartupInfo);
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
});
