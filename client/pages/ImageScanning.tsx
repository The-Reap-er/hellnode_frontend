import React from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Search } from "lucide-react";

export default function ImageScanning() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Package className="h-5 w-5" />
              <span>Image Scanning</span>
            </CardTitle>
            <CardDescription>
              Scan and analyze container images from registries and clusters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="carbon-type-body-01 text-text-02">
              This page lets you run on-demand image scans and view historical
              scan results. Select an image or registry to get started.
            </p>

            <div className="mt-6 flex items-center space-x-2">
              <Button variant="secondary">
                <Search className="mr-2 h-4 w-4" />
                Start scan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
