import { useRef, useState } from 'react';

interface Props {
  accept: string;
  selectLabel: string;
  dropHint: string;
  maxFiles: number;
}

/** Minimal scaffold dropzone: select files -> list them. Full workspace (worker processing) lands with the Merge pilot. */
export default function Dropzone({ accept, selectLabel, dropHint, maxFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  function add(list: FileList | File[]) {
    const arr = Array.from(list).slice(0, maxFiles);
    setFiles((prev) => [...prev, ...arr].slice(0, maxFiles));
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); add(e.dataTransfer.files); }}
        className="rounded-2xl border-2 p-10 text-center transition-colors"
        style={{
          borderColor: dragOver ? 'var(--primary)' : 'var(--border)',
          borderStyle: 'dashed',
          background: dragOver ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--bg-soft)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          className="hidden"
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }}
          aria-label={selectLabel}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-[10px] px-12 py-4 text-[17px] font-semibold text-white shadow-md hover:opacity-90"
          style={{ background: 'var(--primary)' }}
        >
          {selectLabel}
        </button>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-3)' }}>{dropHint}</p>
      </div>
      {files.length > 0 && (
        <ul className="mt-6 space-y-2" aria-label="Selected files">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between rounded-xl border px-4 py-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <span className="truncate text-sm font-medium">{f.name}</span>
              <span className="text-xs shrink-0 ms-3" style={{ color: 'var(--text-3)' }}>
                {(f.size / 1048576).toFixed(1)} MB
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
