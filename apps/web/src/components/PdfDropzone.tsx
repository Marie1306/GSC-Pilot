import { useRef, useState, type DragEvent } from "react";
import "./sharedAi.css";

interface PdfDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Glisser-déposer générique (SEAO / Boîte à outils, 16 septembre 2026) —
 * aucun mécanisme de ce genre n'existait encore dans l'application (confirmé
 * par grep avant de l'ajouter). Ne fait qu'émettre le File choisi — l'appelant
 * décide du flux d'upload (voir lib/storageUpload.ts).
 */
export function PdfDropzone({ onFileSelected, disabled, label = "Glisser un PDF ici, ou cliquer pour parcourir" }: PdfDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <div
      className={`pdf-dropzone${dragOver ? " pdf-dropzone-active" : ""}${disabled ? " pdf-dropzone-disabled" : ""}`}
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOver(false);
        if (!disabled) handleFiles(event.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <p style={{ margin: 0 }}>{label}</p>
    </div>
  );
}
