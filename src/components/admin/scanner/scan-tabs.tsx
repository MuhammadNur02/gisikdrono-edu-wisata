'use client';

import type { ReactNode } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { scannerCopy } from '@/lib/copy/scanner';

const text = scannerCopy.tabs;

// The two ways in of docs/StyleGuide.md §6.6, the camera (live stream or photo) and the manual code, as pill tabs.
export function ScanTabs({ camera, manual }: { camera: ReactNode; manual: ReactNode }) {
  return (
    <Tabs defaultValue="camera">
      <TabsList variant="pill" className="w-full">
        <TabsTrigger value="camera" className="flex-1">
          {text.camera}
        </TabsTrigger>
        <TabsTrigger value="manual" className="flex-1">
          {text.manual}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="camera" className="pt-4">
        {camera}
      </TabsContent>
      <TabsContent value="manual" className="pt-4">
        {manual}
      </TabsContent>
    </Tabs>
  );
}
