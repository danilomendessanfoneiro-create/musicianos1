import React from 'react';
import { parseChordPro } from '../../lib/chordpro';

export const ChordProRenderer: React.FC<{ body: string; fontSize?: number }> = ({ body, fontSize = 16 }) => {
  const lines = parseChordPro(body);

  return (
    <div className="font-mono whitespace-pre" style={{ fontSize }}>
      {lines.map((line, i) => {
        if (line.type === 'blank') return <div key={i} className="h-4" />;
        if (line.type === 'comment') {
          return (
            <div key={i} className="text-indigo-400 font-bold mt-3 mb-1 font-sans">
              {line.text}
            </div>
          );
        }
        return (
          <div key={i} className="mb-3">
            <div className="leading-tight text-teal-400 font-bold">
              {line.segments!.map((seg, j) => (
                <span key={j} style={{ display: 'inline-block', minWidth: `${seg.lyric.length}ch` }}>
                  {seg.chord || '\u00A0'}
                </span>
              ))}
            </div>
            <div className="leading-tight text-zinc-100">
              {line.segments!.map((seg, j) => (
                <span key={j}>{seg.lyric || (seg.chord ? '\u00A0' : '')}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
