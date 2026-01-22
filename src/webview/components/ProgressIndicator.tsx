import React from 'react';
import { Loader2 } from 'lucide-react';

export const ProgressIndicator: React.FC<{ size?: number }> = ({ size = 20 }) => {
  return (
    <div className="progress-indicator">
      <Loader2 size={size} className="spinner" />
    </div>
  );
};
