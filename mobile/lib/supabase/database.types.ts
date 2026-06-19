export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      board_catalog: {
        Row: {
          id: string;
          name: string;
          group_name: string;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          group_name?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          group_name?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      boards: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          cover_url: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          cover_url?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          cover_url?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      link_classification_cache: {
        Row: {
          url_hash: string;
          url: string;
          board_name: string;
          title: string;
          description: string;
          source: string;
          cache_version: number;
          hit_count: number;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          url_hash: string;
          url: string;
          board_name: string;
          title: string;
          description: string;
          source: string;
          cache_version?: number;
          hit_count?: number;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          url_hash?: string;
          url?: string;
          board_name?: string;
          title?: string;
          description?: string;
          source?: string;
          cache_version?: number;
          hit_count?: number;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      bookmarks: {
        Row: {
          id: string;
          board_id: string | null;
          user_id: string;
          url: string;
          title: string | null;
          description: string | null;
          source_app: string | null;
          thumbnail_url: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          board_id?: string | null;
          user_id: string;
          url: string;
          title?: string | null;
          description?: string | null;
          source_app?: string | null;
          thumbnail_url?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          board_id?: string | null;
          user_id?: string;
          url?: string;
          title?: string | null;
          description?: string | null;
          source_app?: string | null;
          thumbnail_url?: string | null;
          created_at?: string | null;
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
    };
    Views: Record<string, never>;
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

export type Board = Database['public']['Tables']['boards']['Row'];
export type Bookmark = Database['public']['Tables']['bookmarks']['Row'];

export type BoardWithCount = Board & {
  bookmark_count: number;
};

export type BookmarkWithBoard = Bookmark & {
  board: Pick<Board, 'id' | 'name'> | null;
};
