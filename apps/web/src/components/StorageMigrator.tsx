'use client';

import { useEffect } from 'react';
import { migrateLocalStorage } from '@/lib/storageMigration';

export function StorageMigrator() {
  useEffect(() => {
    migrateLocalStorage();
  }, []);

  return null;
}
