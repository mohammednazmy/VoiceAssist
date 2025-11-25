/**
 * useTemplates Hook
 * Manages conversation templates using localStorage
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import type {
  ConversationTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  Message,
} from "@voiceassist/types";

const STORAGE_KEY = "voiceassist:templates";

export function useTemplates() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user: _user } = useAuth();
  const [templates, setTemplates] = useState<ConversationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates from localStorage
  const loadTemplates = useCallback(() => {
    setIsLoading(true);
    setError(null);

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allTemplates: ConversationTemplate[] = JSON.parse(stored);
        // Filter by current user if needed (for multi-user scenarios)
        setTemplates(allTemplates);
      } else {
        setTemplates([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load templates");
      console.error("Failed to load templates:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Save templates to localStorage
  const saveToStorage = useCallback(
    (updatedTemplates: ConversationTemplate[]) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTemplates));
        setTemplates(updatedTemplates);
      } catch {
        throw new Error("Failed to save templates to storage");
      }
    },
    [],
  );

  // Create template from conversation
  const createFromConversation = useCallback(
    async (
      conversationId: string,
      conversationTitle: string,
      messages: Message[],
      request: CreateTemplateRequest,
    ) => {
      try {
        const now = new Date().toISOString();
        const newTemplate: ConversationTemplate = {
          id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: request.name,
          description: request.description,
          category: request.category || "General",
          icon: request.icon || "📋",
          color: request.color || "#3B82F6",
          messages: messages.map((msg) => ({
            role: msg.role as "user" | "assistant" | "system",
            content: msg.content,
          })),
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
        };

        const updatedTemplates = [...templates, newTemplate];
        saveToStorage(updatedTemplates);

        return newTemplate;
      } catch (err: any) {
        setError(err.message || "Failed to create template");
        throw err;
      }
    },
    [templates, saveToStorage],
  );

  // Create blank template
  const createTemplate = useCallback(
    async (request: CreateTemplateRequest) => {
      try {
        const now = new Date().toISOString();
        const newTemplate: ConversationTemplate = {
          id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: request.name,
          description: request.description,
          category: request.category || "General",
          icon: request.icon || "📋",
          color: request.color || "#3B82F6",
          messages: [],
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
        };

        const updatedTemplates = [...templates, newTemplate];
        saveToStorage(updatedTemplates);

        return newTemplate;
      } catch (err: any) {
        setError(err.message || "Failed to create template");
        throw err;
      }
    },
    [templates, saveToStorage],
  );

  // Update template
  const updateTemplate = useCallback(
    async (id: string, request: UpdateTemplateRequest) => {
      try {
        const updatedTemplates = templates.map((t) =>
          t.id === id
            ? {
                ...t,
                ...request,
                updatedAt: new Date().toISOString(),
              }
            : t,
        );

        saveToStorage(updatedTemplates);

        return updatedTemplates.find((t) => t.id === id)!;
      } catch (err: any) {
        setError(err.message || "Failed to update template");
        throw err;
      }
    },
    [templates, saveToStorage],
  );

  // Delete template
  const deleteTemplate = useCallback(
    async (id: string) => {
      try {
        const updatedTemplates = templates.filter((t) => t.id !== id);
        saveToStorage(updatedTemplates);
      } catch (err: any) {
        setError(err.message || "Failed to delete template");
        throw err;
      }
    },
    [templates, saveToStorage],
  );

  // Increment usage count
  const incrementUsage = useCallback(
    async (id: string) => {
      try {
        const updatedTemplates = templates.map((t) =>
          t.id === id
            ? {
                ...t,
                usageCount: t.usageCount + 1,
                updatedAt: new Date().toISOString(),
              }
            : t,
        );

        saveToStorage(updatedTemplates);
      } catch (err: any) {
        console.error("Failed to increment template usage:", err);
      }
    },
    [templates, saveToStorage],
  );

  // Get template by ID
  const getTemplate = useCallback(
    (id: string) => {
      return templates.find((t) => t.id === id);
    },
    [templates],
  );

  // Get templates by category
  const getTemplatesByCategory = useCallback(
    (category: string) => {
      return templates.filter((t) => t.category === category);
    },
    [templates],
  );

  return {
    templates,
    isLoading,
    error,
    createTemplate,
    createFromConversation,
    updateTemplate,
    deleteTemplate,
    incrementUsage,
    getTemplate,
    getTemplatesByCategory,
    reload: loadTemplates,
  };
}
