'use client';

import React, { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

interface CesiumMapProps {
  lat: number;
  lng: number;
  label?: string;
}

export default function CesiumMap({ lat, lng, label = 'Hedef Bölge' }: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  // Cesium (birkaç MB JS + CSS) sadece harita ekrana yaklaştığında yüklensin
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || nearViewport) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nearViewport]);

  useEffect(() => {
    // Only run if Cesium is loaded on window and container exists
    if (!loaded || !containerRef.current || !(window as any).Cesium) return;

    const Cesium = (window as any).Cesium;
    
    // Initialize Viewer
    // Use free ArcGIS World Imagery instead of Cesium Ion (which gives 401 Unauthorized)
    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      scene3DOnly: true,
      creditContainer: document.createElement('div'), // Hide credits visually for embedded look
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        )
      )
    });

    // Remove double click behavior
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Fare tekerleği hassasiyeti: varsayılan (zoomFactor 5) tek çentikte çok fazla yakınlaşıyordu.
    // Daha küçük adımlar, bıraktıktan sonra daha kısa kayma ve makul yakınlaşma sınırları.
    const controller = viewer.scene.screenSpaceCameraController;
    controller.zoomFactor = 1.5;
    controller.inertiaZoom = 0.3;
    controller.minimumZoomDistance = 80;          // metre — binaların içine girmesin
    controller.maximumZoomDistance = 20_000_000;  // metre — dünya kadrajdan kaçmasın

    // Initial camera position (High up in space above Turkey)
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(35.2433, 38.9637, 5000000.0),
    });

    // Kampüs işaretçisi (SVG)
    const svgMarker = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
        <path d="M32 60 L24 44 L40 44 Z" fill="#3b82f6" />
        <circle cx="32" cy="28" r="24" fill="#1e3a8a" fill-opacity="0.2" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="3 3" />
        <rect x="16" y="14" width="32" height="26" rx="8" fill="#0f172a" stroke="#3b82f6" stroke-width="2.5" />
        <rect x="12" y="21" width="4" height="12" rx="2" fill="#3b82f6" />
        <rect x="48" y="21" width="4" height="12" rx="2" fill="#3b82f6" />
        <circle cx="14" cy="18" r="2" fill="#3b82f6" />
        <circle cx="50" cy="18" r="2" fill="#3b82f6" />
        <line x1="32" y1="14" x2="32" y2="8" stroke="#3b82f6" stroke-width="2.5" />
        <circle cx="32" cy="6" r="3.5" fill="#3b82f6" />
        <rect x="22" y="21" width="7" height="4" rx="2" fill="#3b82f6" />
        <rect x="35" y="21" width="7" height="4" rx="2" fill="#3b82f6" />
        <path d="M26 31 Q32 35 38 31" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" />
      </svg>
    `;
    const markerUrl = 'data:image/svg+xml;base64,' + btoa(svgMarker);

    // Add modern themed billboard marker
    const markerEntity = viewer.entities.add({
      name: label,
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      billboard: {
        image: markerUrl,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        width: 48,
        height: 48,
        disableDepthTestDistance: Number.POSITIVE_INFINITY // Always render on top
      }
    });

    // Fly animation to the target
    setTimeout(() => {
      viewer.flyTo(markerEntity, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0.0),   // heading
          Cesium.Math.toRadians(-60.0), // pitch
          400.0                         // range (mesafe)
        ),
        duration: 4.5, // 4.5 saniye sinematik uçuş
      });
    }, 1000);

    return () => {
      viewer.destroy();
    };
  }, [loaded, lat, lng, label]);

  return (
    <div ref={wrapperRef} className="group relative h-full w-full overflow-hidden bg-zemin-2">
      {nearViewport && (
        <>
          {/* Cesium CSS */}
          <link rel="stylesheet" href="https://cesium.com/downloads/cesiumjs/releases/1.114/Build/Cesium/Widgets/widgets.css" />

          {/* Cesium JS */}
          <Script
            src="https://cesium.com/downloads/cesiumjs/releases/1.114/Build/Cesium/Cesium.js"
            onReady={() => setLoaded(true)}
          />
        </>
      )}

      {/* Loading Overlay */}
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-zemin-2 px-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-kenar/15 border-t-ana" />
          <span className="animate-pulse font-display text-sm font-bold text-soluk">
            Uydu Bağlantısı Kuruluyor...
          </span>
        </div>
      )}

      {/* Map Container */}
      <div ref={containerRef} className="w-full h-full" />

    </div>
  );
}
