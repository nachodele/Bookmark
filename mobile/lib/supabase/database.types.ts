export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      board_catalog: {
        Row: {
          active: boolean;
          created_at: string;
          group_name: string;
          id: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          group_name?: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          group_name?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      boards: {
        Row: {
          cover_url: string | null;
          created_at: string | null;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string | null;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bookmark_board_memberships: {
        Row: {
          board_id: string;
          bookmark_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          board_id: string;
          bookmark_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          board_id?: string;
          bookmark_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookmark_board_memberships_board_id_fkey';
            columns: ['board_id'];
            isOneToOne: false;
            referencedRelation: 'boards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bookmark_board_memberships_bookmark_id_fkey';
            columns: ['bookmark_id'];
            isOneToOne: false;
            referencedRelation: 'bookmarks';
            referencedColumns: ['id'];
          },
        ];
      };
      bookmarks: {
        Row: {
          ai_category: string | null;
          alt_categories: Json | null;
          author: string | null;
          board_id: string | null;
          category_confidence: number | null;
          category_source: string | null;
          content_excerpt: string | null;
          created_at: string | null;
          deleted_at: string | null;
          description: string | null;
          domain: string | null;
          dominant_colors: string[] | null;
          embedding: string | null;
          final_category: string | null;
          id: string;
          image_caption: string | null;
          in_review_inbox: boolean;
          is_favorite: boolean;
          keywords: string[];
          lang: string | null;
          last_opened_at: string | null;
          model_version: number | null;
          open_count: number;
          published_at: string | null;
          resource_type: string | null;
          source_app: string | null;
          thumbnail_url: string | null;
          title: string | null;
          transcript: string | null;
          updated_at: string;
          url: string;
          user_id: string;
          was_recategorized: boolean;
          word_count: number | null;
        };
        Insert: {
          ai_category?: string | null;
          alt_categories?: Json | null;
          author?: string | null;
          board_id?: string | null;
          category_confidence?: number | null;
          category_source?: string | null;
          content_excerpt?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          domain?: string | null;
          dominant_colors?: string[] | null;
          embedding?: string | null;
          final_category?: string | null;
          id?: string;
          image_caption?: string | null;
          in_review_inbox?: boolean;
          is_favorite?: boolean;
          keywords?: string[];
          lang?: string | null;
          last_opened_at?: string | null;
          model_version?: number | null;
          open_count?: number;
          published_at?: string | null;
          resource_type?: string | null;
          source_app?: string | null;
          thumbnail_url?: string | null;
          title?: string | null;
          transcript?: string | null;
          updated_at?: string;
          url: string;
          user_id: string;
          was_recategorized?: boolean;
          word_count?: number | null;
        };
        Update: {
          ai_category?: string | null;
          alt_categories?: Json | null;
          author?: string | null;
          board_id?: string | null;
          category_confidence?: number | null;
          category_source?: string | null;
          content_excerpt?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          domain?: string | null;
          dominant_colors?: string[] | null;
          embedding?: string | null;
          final_category?: string | null;
          id?: string;
          image_caption?: string | null;
          in_review_inbox?: boolean;
          is_favorite?: boolean;
          keywords?: string[];
          lang?: string | null;
          last_opened_at?: string | null;
          model_version?: number | null;
          open_count?: number;
          published_at?: string | null;
          resource_type?: string | null;
          source_app?: string | null;
          thumbnail_url?: string | null;
          title?: string | null;
          transcript?: string | null;
          updated_at?: string;
          url?: string;
          user_id?: string;
          was_recategorized?: boolean;
          word_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bookmarks_board_id_fkey';
            columns: ['board_id'];
            isOneToOne: false;
            referencedRelation: 'boards';
            referencedColumns: ['id'];
          },
        ];
      };
      link_classification_cache: {
        Row: {
          board_name: string;
          cache_version: number;
          created_at: string;
          description: string;
          expires_at: string;
          hit_count: number;
          source: string;
          title: string;
          url: string;
          url_hash: string;
        };
        Insert: {
          board_name: string;
          cache_version?: number;
          created_at?: string;
          description: string;
          expires_at?: string;
          hit_count?: number;
          source: string;
          title: string;
          url: string;
          url_hash: string;
        };
        Update: {
          board_name?: string;
          cache_version?: number;
          created_at?: string;
          description?: string;
          expires_at?: string;
          hit_count?: number;
          source?: string;
          title?: string;
          url?: string;
          url_hash?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      resource_training_view: {
        Row: {
          ai_category: string | null;
          author: string | null;
          category_confidence: number | null;
          category_group: string | null;
          category_source: string | null;
          content_excerpt: string | null;
          created_at: string | null;
          description: string | null;
          domain: string | null;
          final_category: string | null;
          id: string | null;
          is_favorite: boolean | null;
          keywords: string[] | null;
          lang: string | null;
          last_opened_at: string | null;
          open_count: number | null;
          published_at: string | null;
          resource_type: string | null;
          source_app: string | null;
          title: string | null;
          url: string | null;
          user_id: string | null;
          was_recategorized: boolean | null;
          word_count: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      increment_classification_cache_hit: {
        Args: { p_url_hash: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Board = Database['public']['Tables']['boards']['Row'];
export type Bookmark = Database['public']['Tables']['bookmarks']['Row'];

export type BoardWithCount = Board & {
  bookmark_count: number;
};

export type BookmarkWithBoard = Bookmark & {
  board: Pick<Board, 'id' | 'name'> | null;
  /** All boards this bookmark appears in (primary + memberships) */
  extra_boards?: Pick<Board, 'id' | 'name'>[];
};
