import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';

export const handlers = [
  http.get('/api/mock-files', () =>
    HttpResponse.json({
      files: [
        {
          name: '01 Full Send (Act II).cue',
          url: '/mocks/01%20Full%20Send%20%28Act%20II%29.cue',
          type: 'text/plain',
        },
        {
          name: '01 Full Send (Act II).mp3',
          url: '/mocks/01%20Full%20Send%20%28Act%20II%29.mp3',
          type: 'audio/mpeg',
        },
      ],
    }),
  ),
];

export const worker = setupWorker(...handlers);
