import { useRef } from 'react';
import { useCoverage } from '../context/CoverageContext';

export default function FileUpload() {
  const { loadFromFile } = useCoverage();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFromFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        onChange={handleChange}
        className="hidden"
        id="file-upload"
        aria-label="Upload coverage report"
      />
      <label
        htmlFor="file-upload"
        className="cursor-pointer inline-flex items-center px-4 py-2 rounded-lg border border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
      >
        📂 Load Report
      </label>
    </div>
  );
}
