'use client';

import { diffLines } from 'diff';
import clsx from 'clsx';

interface DiffViewProps {
  oldContent: string;
  newContent: string;
}

export default function DiffView({ oldContent, newContent }: DiffViewProps) {
  const diff = diffLines(oldContent, newContent);

  return (
    <div className="font-mono text-sm">
      {diff.map((part, index) => {
        if (part.added) {
          return (
            <div key={index} className="bg-green-50 border-l-4 border-green-500 pl-2 py-0.5">
              <span className="text-green-800">+ </span>
              <span className="text-green-900 whitespace-pre-wrap">{part.value}</span>
            </div>
          );
        }
        if (part.removed) {
          return (
            <div key={index} className="bg-red-50 border-l-4 border-red-500 pl-2 py-0.5">
              <span className="text-red-800">- </span>
              <span className="text-red-900 whitespace-pre-wrap line-through">{part.value}</span>
            </div>
          );
        }
        return (
          <div key={index} className="text-gray-700 pl-2 py-0.5 whitespace-pre-wrap">
            {part.value}
          </div>
        );
      })}
    </div>
  );
}

