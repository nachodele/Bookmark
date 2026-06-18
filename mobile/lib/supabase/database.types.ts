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
    Functions: Record<string, never>;
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
