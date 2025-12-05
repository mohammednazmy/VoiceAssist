/**
 * Media Gallery Component for Voice Mode v4
 *
 * Displays images, videos, and file attachments in a flexible grid layout
 * with lightbox support for full-screen image viewing.
 *
 * Phase 2 Deliverable: UI > Chat Page Redesign
 *
 * @example
 * ```tsx
 * <MediaGallery
 *   attachments={message.attachments}
 *   layout="masonry"
 *   enableLightbox={true}
 *   maxPreviewHeight={300}
 * />
 * ```
 */

import React, { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from "lucide-react";

/**
 * Attachment type from API
 */
export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration?: number; // For videos/audio
  alt_text?: string;
}

/**
 * Media gallery layout options
 */
export type GalleryLayout = "grid" | "masonry" | "inline";

/**
 * Props for MediaGallery component
 */
export interface MediaGalleryProps {
  attachments: Attachment[];
  layout?: GalleryLayout;
  enableLightbox?: boolean;
  maxPreviewHeight?: number;
  className?: string;
  onAttachmentClick?: (attachment: Attachment, index: number) => void;
}

/**
 * Check if content type is an image
 */
function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/**
 * Check if content type is a video
 */
function isVideo(contentType: string): boolean {
  return contentType.startsWith("video/");
}

/**
 * Check if content type is audio
 */
function isAudio(contentType: string): boolean {
  return contentType.startsWith("audio/");
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get icon for file type
 */
function getFileIcon(contentType: string): React.ElementType {
  if (isImage(contentType)) return FileImage;
  if (isVideo(contentType)) return FileVideo;
  if (isAudio(contentType)) return FileAudio;
  if (contentType.includes("pdf")) return FileText;
  return File;
}

/**
 * Combine class names
 */
function cn(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Image Preview Component
 */
interface ImagePreviewProps {
  attachment: Attachment;
  onClick: () => void;
  maxHeight: number;
}

function ImagePreview({ attachment, onClick, maxHeight }: ImagePreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-lg bg-neutral-100",
        "hover:ring-2 hover:ring-primary-400 hover:ring-offset-2",
        "focus:outline-none focus:ring-2 focus:ring-primary-500",
        "transition-all duration-200",
      )}
      style={{ maxHeight }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      aria-label={`View ${attachment.filename}`}
    >
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 animate-pulse bg-neutral-200" />
      )}

      {hasError ? (
        <div className="flex items-center justify-center h-32 text-neutral-400">
          <FileImage className="w-8 h-8" />
        </div>
      ) : (
        <img
          src={attachment.thumbnail_url || attachment.url}
          alt={attachment.alt_text || attachment.filename}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      )}

      {/* Hover overlay with zoom icon */}
      <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
        <ZoomIn className="w-6 h-6 text-white drop-shadow-lg" />
      </div>
    </motion.button>
  );
}

/**
 * Video Embed Component
 */
interface VideoEmbedProps {
  attachment: Attachment;
}

function VideoEmbed({ attachment }: VideoEmbedProps) {
  return (
    <div className="relative rounded-lg overflow-hidden bg-black">
      <video
        src={attachment.url}
        controls
        className="w-full max-h-[400px]"
        preload="metadata"
        poster={attachment.thumbnail_url}
      >
        <track kind="captions" />
        Your browser does not support the video tag.
      </video>
      {attachment.duration && (
        <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
          {Math.floor(attachment.duration / 60)}:
          {String(Math.floor(attachment.duration % 60)).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

/**
 * File Preview Card Component
 */
interface FilePreviewCardProps {
  attachment: Attachment;
}

function FilePreviewCard({ attachment }: FilePreviewCardProps) {
  const Icon = getFileIcon(attachment.content_type);

  return (
    <motion.a
      href={attachment.url}
      download={attachment.filename}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg",
        "bg-neutral-50 border border-neutral-200",
        "hover:bg-neutral-100 hover:border-neutral-300",
        "transition-colors duration-200",
      )}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <Icon className="w-8 h-8 text-neutral-500 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 truncate">
          {attachment.filename}
        </p>
        <p className="text-xs text-neutral-500">
          {formatFileSize(attachment.size)}
        </p>
      </div>
      <Download className="w-4 h-4 text-neutral-400" />
    </motion.a>
  );
}

/**
 * Lightbox Component for full-screen image viewing
 */
interface LightboxProps {
  open: boolean;
  onClose: () => void;
  images: Attachment[];
  activeIndex: number;
  onIndexChange?: (index: number) => void;
}

function Lightbox({
  open,
  onClose,
  images,
  activeIndex,
  onIndexChange,
}: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const currentImage = images[activeIndex];
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < images.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      onIndexChange?.(activeIndex - 1);
      setZoom(1);
      setRotation(0);
    }
  }, [hasPrev, activeIndex, onIndexChange]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      onIndexChange?.(activeIndex + 1);
      setZoom(1);
      setRotation(0);
    }
  }, [hasNext, activeIndex, onIndexChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goToPrev();
          break;
        case "ArrowRight":
          goToNext();
          break;
        case "+":
        case "=":
          setZoom((z) => Math.min(z + 0.5, 4));
          break;
        case "-":
          setZoom((z) => Math.max(z - 0.5, 0.5));
          break;
        case "r":
          setRotation((r) => (r + 90) % 360);
          break;
      }
    },
    [onClose, goToPrev, goToNext],
  );

  React.useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleKeyDown]);

  // Reset zoom/rotation when image changes
  React.useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {open && currentImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={onClose}
        >
          {/* Toolbar */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4">
              <span className="text-white/90 text-sm">
                {activeIndex + 1} / {images.length}
              </span>
              <span className="text-white/70 text-sm truncate max-w-xs">
                {currentImage.filename}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.5, 0.5))}
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white/70 text-sm w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.5, 4))}
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
                aria-label="Rotate"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <a
                href={currentImage.url}
                download={currentImage.filename}
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
                aria-label="Download"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-5 h-5" />
              </a>
              <a
                href={currentImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
                aria-label="Open in new tab"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-5 h-5" />
              </a>
              <button
                onClick={onClose}
                className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation arrows */}
          {hasPrev && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrev();
              }}
              className="absolute left-4 p-3 text-white/80 hover:text-white rounded-full bg-black/30 hover:bg-black/50 transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {hasNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-4 p-3 text-white/80 hover:text-white rounded-full bg-black/30 hover:bg-black/50 transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Image */}
          <motion.img
            key={currentImage.id}
            src={currentImage.url}
            alt={currentImage.alt_text || currentImage.filename}
            className="max-w-[90vw] max-h-[85vh] object-contain"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: "transform 0.2s ease-out",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div
              className="absolute bottom-0 left-0 right-0 p-4 flex justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent overflow-x-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => onIndexChange?.(idx)}
                  className={cn(
                    "w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0",
                    idx === activeIndex
                      ? "border-white ring-2 ring-white/50"
                      : "border-transparent opacity-60 hover:opacity-100",
                  )}
                >
                  <img
                    src={img.thumbnail_url || img.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * MediaGallery Component
 *
 * Displays attachments in a grid layout with support for images, videos, and files.
 */
export function MediaGallery({
  attachments,
  layout = "masonry",
  enableLightbox = true,
  maxPreviewHeight = 300,
  className,
  onAttachmentClick,
}: MediaGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Categorize attachments
  const { images, videos, files } = useMemo(() => {
    return {
      images: attachments.filter((a) => isImage(a.content_type)),
      videos: attachments.filter((a) => isVideo(a.content_type)),
      files: attachments.filter(
        (a) => !isImage(a.content_type) && !isVideo(a.content_type),
      ),
    };
  }, [attachments]);

  const handleImageClick = useCallback(
    (idx: number) => {
      if (enableLightbox) {
        setActiveIndex(idx);
        setLightboxOpen(true);
      }
      onAttachmentClick?.(images[idx], idx);
    },
    [enableLightbox, images, onAttachmentClick],
  );

  // Calculate grid columns based on image count
  const gridCols = useMemo(() => {
    if (images.length === 1) return "grid-cols-1";
    if (images.length === 2) return "grid-cols-2";
    return "grid-cols-3";
  }, [images.length]);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={cn("media-gallery mt-3 space-y-3", className)}>
      {/* Images Grid */}
      {images.length > 0 && (
        <div className={cn("grid gap-2", gridCols)}>
          {images.map((img, idx) => (
            <ImagePreview
              key={img.id}
              attachment={img}
              onClick={() => handleImageClick(idx)}
              maxHeight={maxPreviewHeight}
            />
          ))}
        </div>
      )}

      {/* Videos */}
      {videos.map((video) => (
        <VideoEmbed key={video.id} attachment={video} />
      ))}

      {/* Files */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <FilePreviewCard key={file.id} attachment={file} />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {enableLightbox && (
        <Lightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={images}
          activeIndex={activeIndex}
          onIndexChange={setActiveIndex}
        />
      )}
    </div>
  );
}

export default MediaGallery;
