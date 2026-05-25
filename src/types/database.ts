export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          created_at: string
          harvest_mode: string | null
          id: string
          mineral_result: string | null
          position_x: number
          position_y: number
          realm_id: string
          secondary_terrain: Database["public"]["Enums"]["terrain_type"] | null
          terrain: Database["public"]["Enums"]["terrain_type"]
        }
        Insert: {
          created_at?: string
          harvest_mode?: string | null
          id?: string
          mineral_result?: string | null
          position_x?: number
          position_y?: number
          realm_id: string
          secondary_terrain?: Database["public"]["Enums"]["terrain_type"] | null
          terrain: Database["public"]["Enums"]["terrain_type"]
        }
        Update: {
          created_at?: string
          harvest_mode?: string | null
          id?: string
          mineral_result?: string | null
          position_x?: number
          position_y?: number
          realm_id?: string
          secondary_terrain?: Database["public"]["Enums"]["terrain_type"] | null
          terrain?: Database["public"]["Enums"]["terrain_type"]
        }
        Relationships: [
          {
            foreignKeyName: "areas_realm_id_fkey"
            columns: ["realm_id"]
            isOneToOne: false
            referencedRelation: "realms"
            referencedColumns: ["id"]
          },
        ]
      }
      populations: {
        Row: {
          count: number
          created_at: string
          home_area_id: string | null
          id: string
          race: Database["public"]["Enums"]["race"]
          realm_id: string
          work_area_id: string | null
        }
        Insert: {
          count?: number
          created_at?: string
          home_area_id?: string | null
          id?: string
          race: Database["public"]["Enums"]["race"]
          realm_id: string
          work_area_id?: string | null
        }
        Update: {
          count?: number
          created_at?: string
          home_area_id?: string | null
          id?: string
          race?: Database["public"]["Enums"]["race"]
          realm_id?: string
          work_area_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "populations_home_area_id_fkey"
            columns: ["home_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "populations_realm_id_fkey"
            columns: ["realm_id"]
            isOneToOne: false
            referencedRelation: "realms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "populations_work_area_id_fkey"
            columns: ["work_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      realms: {
        Row: {
          climate_template: Database["public"]["Enums"]["climate_template"]
          cover_image_url: string | null
          created_at: string
          current_season: Database["public"]["Enums"]["season"]
          current_year: number
          ending_story: Json | null
          id: string
          name: string
          origin_story: Json | null
          owner_id: string
          resource_pool: Json
          ruler_portrait_url: string | null
          scale: Database["public"]["Enums"]["realm_scale"]
          settings: Json
          updated_at: string
        }
        Insert: {
          climate_template?: Database["public"]["Enums"]["climate_template"]
          cover_image_url?: string | null
          created_at?: string
          current_season?: Database["public"]["Enums"]["season"]
          current_year?: number
          ending_story?: Json | null
          id?: string
          name: string
          origin_story?: Json | null
          owner_id: string
          resource_pool?: Json
          ruler_portrait_url?: string | null
          scale?: Database["public"]["Enums"]["realm_scale"]
          settings?: Json
          updated_at?: string
        }
        Update: {
          climate_template?: Database["public"]["Enums"]["climate_template"]
          cover_image_url?: string | null
          created_at?: string
          current_season?: Database["public"]["Enums"]["season"]
          current_year?: number
          ending_story?: Json | null
          id?: string
          name?: string
          origin_story?: Json | null
          owner_id?: string
          resource_pool?: Json
          ruler_portrait_url?: string | null
          scale?: Database["public"]["Enums"]["realm_scale"]
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      strongholds: {
        Row: {
          area_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["stronghold_kind"]
          mine_resource_type:
            | Database["public"]["Enums"]["mine_resource"]
            | null
          name: string | null
          parent_stronghold_id: string | null
          realm_id: string
          source: string
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["stronghold_kind"]
          mine_resource_type?:
            | Database["public"]["Enums"]["mine_resource"]
            | null
          name?: string | null
          parent_stronghold_id?: string | null
          realm_id: string
          source?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["stronghold_kind"]
          mine_resource_type?:
            | Database["public"]["Enums"]["mine_resource"]
            | null
          name?: string | null
          parent_stronghold_id?: string | null
          realm_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "strongholds_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strongholds_parent_stronghold_id_fkey"
            columns: ["parent_stronghold_id"]
            isOneToOne: false
            referencedRelation: "strongholds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strongholds_realm_id_fkey"
            columns: ["realm_id"]
            isOneToOne: false
            referencedRelation: "realms"
            referencedColumns: ["id"]
          },
        ]
      }
      turn_history: {
        Row: {
          created_at: string
          events: Json
          id: string
          realm_id: string
          season: Database["public"]["Enums"]["season"]
          year: number
        }
        Insert: {
          created_at?: string
          events?: Json
          id?: string
          realm_id: string
          season: Database["public"]["Enums"]["season"]
          year: number
        }
        Update: {
          created_at?: string
          events?: Json
          id?: string
          realm_id?: string
          season?: Database["public"]["Enums"]["season"]
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "turn_history_realm_id_fkey"
            columns: ["realm_id"]
            isOneToOne: false
            referencedRelation: "realms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_owns_realm: { Args: { realm_uuid: string }; Returns: boolean }
    }
    Enums: {
      climate_template:
        | "standard"
        | "coastal"
        | "desert"
        | "forest"
        | "hills"
        | "mountains"
      mine_resource: "stone" | "mineral"
      race:
        | "dwarves"
        | "elves"
        | "gnomes"
        | "goblins"
        | "halflings"
        | "humans"
        | "orcs"
        | "undead"
      realm_scale: "barony" | "kingdom" | "empire"
      season: "spring" | "summer" | "fall" | "winter"
      stronghold_kind:
        | "village"
        | "town"
        | "city"
        | "keep"
        | "castle"
        | "citadel"
        | "mine"
        | "wall"
        | "marketplace"
        | "port"
        | "craftsmens_guild"
        | "wizards_academy"
        | "grand_temple"
      terrain_type:
        | "forest"
        | "hills"
        | "plains"
        | "mountains"
        | "ruins"
        | "swamp"
        | "wasteland"
        | "water"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
