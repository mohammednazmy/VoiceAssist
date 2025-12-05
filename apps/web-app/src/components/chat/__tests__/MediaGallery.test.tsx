/**
 * Unit tests for MediaGallery Component
 *
 * Phase 3: Testing - Voice Mode v4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MediaGallery, type Attachment } from "../MediaGallery";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
    a: ({ children, ...props }: any) => <a {...props}>{children}</a>,
    img: ({ children, ...props }: any) => <img {...props}>{children}</img>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  X: () => <span data-testid="icon-x">X</span>,
  ChevronLeft: () => <span data-testid="icon-chevron-left">ChevronLeft</span>,
  ChevronRight: () => (
    <span data-testid="icon-chevron-right">ChevronRight</span>
  ),
  Download: () => <span data-testid="icon-download">Download</span>,
  ExternalLink: () => (
    <span data-testid="icon-external-link">ExternalLink</span>
  ),
  FileText: () => <span data-testid="icon-file-text">FileText</span>,
  FileImage: () => <span data-testid="icon-file-image">FileImage</span>,
  FileVideo: () => <span data-testid="icon-file-video">FileVideo</span>,
  FileAudio: () => <span data-testid="icon-file-audio">FileAudio</span>,
  File: () => <span data-testid="icon-file">File</span>,
  ZoomIn: () => <span data-testid="icon-zoom-in">ZoomIn</span>,
  ZoomOut: () => <span data-testid="icon-zoom-out">ZoomOut</span>,
  RotateCw: () => <span data-testid="icon-rotate">RotateCw</span>,
}));

describe("MediaGallery", () => {
  const mockImageAttachment: Attachment = {
    id: "img-1",
    filename: "test-image.jpg",
    content_type: "image/jpeg",
    size: 102400,
    url: "https://example.com/images/test-image.jpg",
    thumbnail_url: "https://example.com/thumbnails/test-image.jpg",
    width: 800,
    height: 600,
    alt_text: "A test image",
  };

  const mockVideoAttachment: Attachment = {
    id: "vid-1",
    filename: "test-video.mp4",
    content_type: "video/mp4",
    size: 5242880,
    url: "https://example.com/videos/test-video.mp4",
    thumbnail_url: "https://example.com/thumbnails/test-video.jpg",
    duration: 120,
  };

  const mockFileAttachment: Attachment = {
    id: "file-1",
    filename: "document.pdf",
    content_type: "application/pdf",
    size: 51200,
    url: "https://example.com/files/document.pdf",
  };

  const mockAudioAttachment: Attachment = {
    id: "audio-1",
    filename: "recording.mp3",
    content_type: "audio/mpeg",
    size: 1024000,
    url: "https://example.com/audio/recording.mp3",
    duration: 180,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty state", () => {
    it("should render nothing when attachments array is empty", () => {
      const { container } = render(<MediaGallery attachments={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Image rendering", () => {
    it("should render single image with grid-cols-1", () => {
      render(<MediaGallery attachments={[mockImageAttachment]} />);

      const image = screen.getByAltText("A test image");
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute("src", mockImageAttachment.thumbnail_url);
    });

    it("should render two images with grid-cols-2", () => {
      const attachments = [
        mockImageAttachment,
        { ...mockImageAttachment, id: "img-2", filename: "test-image-2.jpg" },
      ];
      render(<MediaGallery attachments={attachments} />);

      const images = screen.getAllByRole("button");
      expect(images).toHaveLength(2);
    });

    it("should render three or more images with grid-cols-3", () => {
      const attachments = [
        mockImageAttachment,
        { ...mockImageAttachment, id: "img-2" },
        { ...mockImageAttachment, id: "img-3" },
      ];
      render(<MediaGallery attachments={attachments} />);

      const images = screen.getAllByRole("button");
      expect(images).toHaveLength(3);
    });

    it("should use main URL if thumbnail is not available", () => {
      const attachmentWithoutThumb = {
        ...mockImageAttachment,
        thumbnail_url: undefined,
      };
      render(<MediaGallery attachments={[attachmentWithoutThumb]} />);

      const image = screen.getByAltText("A test image");
      expect(image).toHaveAttribute("src", mockImageAttachment.url);
    });

    it("should use filename as alt text if alt_text is not provided", () => {
      const attachmentWithoutAlt = {
        ...mockImageAttachment,
        alt_text: undefined,
      };
      render(<MediaGallery attachments={[attachmentWithoutAlt]} />);

      expect(screen.getByAltText("test-image.jpg")).toBeInTheDocument();
    });
  });

  describe("Video rendering", () => {
    it("should render video with controls", () => {
      render(<MediaGallery attachments={[mockVideoAttachment]} />);

      const video =
        screen.getByRole("video") || document.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute("controls");
    });

    it("should display video duration", () => {
      render(<MediaGallery attachments={[mockVideoAttachment]} />);

      // Duration of 120 seconds = 2:00
      expect(screen.getByText("2:00")).toBeInTheDocument();
    });

    it("should use thumbnail as poster", () => {
      render(<MediaGallery attachments={[mockVideoAttachment]} />);

      const video = document.querySelector("video");
      expect(video).toHaveAttribute(
        "poster",
        mockVideoAttachment.thumbnail_url,
      );
    });
  });

  describe("File rendering", () => {
    it("should render file preview card", () => {
      render(<MediaGallery attachments={[mockFileAttachment]} />);

      expect(screen.getByText("document.pdf")).toBeInTheDocument();
    });

    it("should display formatted file size", () => {
      render(<MediaGallery attachments={[mockFileAttachment]} />);

      // 51200 bytes = 50 KB
      expect(screen.getByText("50 KB")).toBeInTheDocument();
    });

    it("should have download link", () => {
      render(<MediaGallery attachments={[mockFileAttachment]} />);

      const downloadLink = screen.getByRole("link");
      expect(downloadLink).toHaveAttribute("href", mockFileAttachment.url);
      expect(downloadLink).toHaveAttribute(
        "download",
        mockFileAttachment.filename,
      );
    });

    it("should show correct icon for PDF files", () => {
      render(<MediaGallery attachments={[mockFileAttachment]} />);

      expect(screen.getByTestId("icon-file-text")).toBeInTheDocument();
    });
  });

  describe("Mixed content", () => {
    it("should render images, videos, and files together", () => {
      const attachments = [
        mockImageAttachment,
        mockVideoAttachment,
        mockFileAttachment,
      ];
      render(<MediaGallery attachments={attachments} />);

      // Image button (for lightbox)
      expect(screen.getByAltText("A test image")).toBeInTheDocument();

      // Video
      expect(document.querySelector("video")).toBeInTheDocument();

      // File
      expect(screen.getByText("document.pdf")).toBeInTheDocument();
    });
  });

  describe("Lightbox", () => {
    it("should open lightbox when image is clicked", async () => {
      render(
        <MediaGallery
          attachments={[mockImageAttachment]}
          enableLightbox={true}
        />,
      );

      const imageButton = screen.getByRole("button");
      fireEvent.click(imageButton);

      await waitFor(() => {
        // Lightbox should show full image
        const lightboxImage = screen.getAllByAltText("A test image");
        expect(lightboxImage.length).toBeGreaterThan(1);
      });
    });

    it("should not open lightbox when enableLightbox is false", () => {
      render(
        <MediaGallery
          attachments={[mockImageAttachment]}
          enableLightbox={false}
        />,
      );

      const imageButton = screen.getByRole("button");
      fireEvent.click(imageButton);

      // Should only have one image (the preview)
      const images = screen.getAllByAltText("A test image");
      expect(images).toHaveLength(1);
    });

    it("should close lightbox when close button is clicked", async () => {
      render(
        <MediaGallery
          attachments={[mockImageAttachment]}
          enableLightbox={true}
        />,
      );

      // Open lightbox
      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => {
        expect(screen.getAllByAltText("A test image").length).toBeGreaterThan(
          1,
        );
      });

      // Close lightbox
      const closeButton = screen.getByLabelText("Close");
      fireEvent.click(closeButton);

      await waitFor(() => {
        const images = screen.getAllByAltText("A test image");
        expect(images).toHaveLength(1);
      });
    });

    it("should show navigation arrows with multiple images", async () => {
      const attachments = [
        mockImageAttachment,
        {
          ...mockImageAttachment,
          id: "img-2",
          filename: "image2.jpg",
          alt_text: "Second image",
        },
      ];
      render(<MediaGallery attachments={attachments} enableLightbox={true} />);

      // Open lightbox on first image
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        expect(screen.getByLabelText("Next image")).toBeInTheDocument();
      });

      // Should not show previous button on first image
      expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    });

    it("should navigate to next image when next button is clicked", async () => {
      const attachments = [
        mockImageAttachment,
        {
          ...mockImageAttachment,
          id: "img-2",
          filename: "image2.jpg",
          alt_text: "Second image",
        },
      ];
      render(<MediaGallery attachments={attachments} enableLightbox={true} />);

      // Open lightbox
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[0]);

      await waitFor(() => {
        expect(screen.getByText("1 / 2")).toBeInTheDocument();
      });

      // Navigate to next
      fireEvent.click(screen.getByLabelText("Next image"));

      await waitFor(() => {
        expect(screen.getByText("2 / 2")).toBeInTheDocument();
      });
    });
  });

  describe("Callback props", () => {
    it("should call onAttachmentClick when image is clicked", () => {
      const onAttachmentClick = vi.fn();
      render(
        <MediaGallery
          attachments={[mockImageAttachment]}
          onAttachmentClick={onAttachmentClick}
          enableLightbox={false}
        />,
      );

      fireEvent.click(screen.getByRole("button"));

      expect(onAttachmentClick).toHaveBeenCalledWith(mockImageAttachment, 0);
    });
  });

  describe("Layout options", () => {
    it("should apply custom className", () => {
      const { container } = render(
        <MediaGallery
          attachments={[mockImageAttachment]}
          className="custom-gallery-class"
        />,
      );

      expect(container.firstChild).toHaveClass("custom-gallery-class");
    });

    it("should respect maxPreviewHeight", () => {
      render(
        <MediaGallery
          attachments={[mockImageAttachment]}
          maxPreviewHeight={200}
        />,
      );

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ maxHeight: 200 });
    });
  });

  describe("File size formatting", () => {
    it("should format bytes correctly", () => {
      const attachments = [
        { ...mockFileAttachment, size: 500 }, // 500 B
      ];
      render(<MediaGallery attachments={attachments} />);
      expect(screen.getByText("500 B")).toBeInTheDocument();
    });

    it("should format KB correctly", () => {
      const attachments = [
        { ...mockFileAttachment, size: 2048 }, // 2 KB
      ];
      render(<MediaGallery attachments={attachments} />);
      expect(screen.getByText("2 KB")).toBeInTheDocument();
    });

    it("should format MB correctly", () => {
      const attachments = [
        { ...mockFileAttachment, size: 5242880 }, // 5 MB
      ];
      render(<MediaGallery attachments={attachments} />);
      expect(screen.getByText("5 MB")).toBeInTheDocument();
    });
  });
});
