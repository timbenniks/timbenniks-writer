"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// Cloudinary Media Library Widget types
interface CloudinaryAsset {
  public_id: string;
  secure_url: string;
  url: string;
  resource_type: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
  derived?: Array<{
    secure_url: string;
    url: string;
  }>;
}

interface CloudinaryWidgetResult {
  assets: CloudinaryAsset[];
}

interface CloudinaryWidget {
  show: (options?: { folder?: string }) => void;
  hide: () => void;
}

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
}

declare global {
  interface Window {
    cloudinary?: {
      createMediaLibrary: (
        options: {
          cloud_name: string;
          api_key: string;
          multiple?: boolean;
          max_files?: number;
          insert_caption?: string;
          default_transformations?: Array<Array<{ quality?: string; fetch_format?: string }>>;
          folder?: { path: string; resource_type?: string };
        },
        handlers: {
          insertHandler: (data: CloudinaryWidgetResult) => void;
        }
      ) => CloudinaryWidget;
    };
  }
}

interface UseCloudinaryWidgetOptions {
  onSelect: (url: string) => void;
  folder?: string;
}

export function useCloudinaryWidget({ onSelect, folder }: UseCloudinaryWidgetOptions) {
  const widgetRef = useRef<CloudinaryWidget | null>(null);
  const scriptLoadedRef = useRef(false);
  const [config, setConfig] = useState<CloudinaryConfig | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  // Load config from API (environment variables)
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/cloudinary/config");
        const data = await response.json();

        if (data.configured && data.cloudName && data.apiKey) {
          setConfig({
            cloudName: data.cloudName,
            apiKey: data.apiKey,
          });
          setIsConfigured(true);
        } else {
          setConfig(null);
          setIsConfigured(false);
        }
      } catch (e) {
        console.error("Failed to load Cloudinary config:", e);
        setConfig(null);
        setIsConfigured(false);
      }
    };

    loadConfig();
  }, []);

  // Load the Cloudinary script
  useEffect(() => {
    if (scriptLoadedRef.current) return;

    // Check if script is already loaded
    if (document.querySelector('script[src*="cloudinary-core"]')) {
      scriptLoadedRef.current = true;
      return;
    }

    const script = document.createElement("script");
    script.src = "https://media-library.cloudinary.com/global/all.js";
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
    };
    document.body.appendChild(script);

    return () => {
      // Don't remove the script on cleanup as other components might use it
    };
  }, []);

  // Initialize the widget
  const initWidget = useCallback(() => {
    if (!window.cloudinary || widgetRef.current || !config) return;

    const options: {
      cloud_name: string;
      api_key: string;
      multiple: boolean;
      max_files: number;
      insert_caption: string;
      default_transformations: Array<Array<{ quality?: string; fetch_format?: string }>>;
      folder?: { path: string; resource_type?: string };
    } = {
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      multiple: false,
      max_files: 1,
      insert_caption: "Select Image",
      default_transformations: [[{ quality: "auto", fetch_format: "auto" }]],
    };

    // Set default folder if provided
    if (folder) {
      options.folder = { path: folder, resource_type: "image" };
    }

    widgetRef.current = window.cloudinary.createMediaLibrary(
      options,
      {
        insertHandler: (data: CloudinaryWidgetResult) => {
          if (data.assets && data.assets.length > 0) {
            const asset = data.assets[0];
            // Use the secure URL with auto quality and format
            const url = asset.derived?.[0]?.secure_url || asset.secure_url;
            onSelect(url);
          }
        },
      }
    );
  }, [onSelect, config, folder]);

  // Reset widget when config or folder changes
  useEffect(() => {
    widgetRef.current = null;
  }, [config, folder]);

  // Open the media library
  const openMediaLibrary = useCallback(() => {
    if (!config) {
      alert("Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY in .env.local");
      return;
    }

    // Wait for script to load if not ready
    if (!window.cloudinary) {
      const checkInterval = setInterval(() => {
        if (window.cloudinary) {
          clearInterval(checkInterval);
          initWidget();
          widgetRef.current?.show();
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => clearInterval(checkInterval), 5000);
      return;
    }

    if (!widgetRef.current) {
      initWidget();
    }

    widgetRef.current?.show();
  }, [initWidget, config]);

  return { openMediaLibrary, isConfigured };
}
