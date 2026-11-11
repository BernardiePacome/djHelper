import { parseCueTracks } from './cue-parser';

describe('parseCueTracks', () => {
  it('reads title, artist and start time of every track', () => {
    const cue = [
      'FILE "mix.mp3" MP3',
      '  TRACK 01 AUDIO',
      '    TITLE "Hypnotize"',
      '    PERFORMER "Alesso"',
      '    INDEX 01 00:00:00',
      '  TRACK 02 AUDIO',
      '    TITLE "Forum"',
      '    PERFORMER "Julian Jeweil"',
      '    INDEX 01 08:25:00',
    ].join('\r\n');

    expect(parseCueTracks(cue)).toEqual([
      { title: 'Hypnotize', artist: 'Alesso', playTime: '00:00:00' },
      { title: 'Forum', artist: 'Julian Jeweil', playTime: '08:25:00' },
    ]);
  });

  it('uses Unknown for a missing artist and skips tracks without a title or start time', () => {
    const cue = [
      '  TRACK 01 AUDIO',
      '    TITLE "No artist"',
      '    INDEX 01 00:00:00',
      '  TRACK 02 AUDIO',
      '    TITLE "No time"',
      '  TRACK 03 AUDIO',
      '    PERFORMER "No title"',
      '    INDEX 01 02:00:00',
    ].join('\n');

    expect(parseCueTracks(cue)).toEqual([{ title: 'No artist', artist: 'Unknown', playTime: '00:00:00' }]);
  });
});
