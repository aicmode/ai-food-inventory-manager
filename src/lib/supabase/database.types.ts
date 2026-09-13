export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_organization_id_parent_id_fkey"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          last_value: number
          organization_id: string
          period: string
          prefix: string
        }
        Insert: {
          last_value?: number
          organization_id: string
          period: string
          prefix: string
        }
        Update: {
          last_value?: number
          organization_id?: string
          period?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          location_id: string
          organization_id: string
          product_id: string
          quantity_available: number | null
          quantity_on_hand: number
          quantity_reserved: number
          updated_at: string
        }
        Insert: {
          location_id: string
          organization_id: string
          product_id: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
        }
        Update: {
          location_id?: string
          organization_id?: string
          product_id?: string
          quantity_available?: number | null
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_balances_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          created_at: string
          expiration_date: string | null
          id: string
          location_id: string
          lot_number: string
          manufacture_date: string | null
          organization_id: string
          product_id: string
          purchase_order_id: string | null
          quantity_received: number
          quantity_remaining: number
          quarantine_reason: string | null
          receipt_id: string | null
          received_date: string
          source_lot_id: string | null
          status: Database["public"]["Enums"]["lot_status"]
          supplier_id: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiration_date?: string | null
          id?: string
          location_id: string
          lot_number: string
          manufacture_date?: string | null
          organization_id: string
          product_id: string
          purchase_order_id?: string | null
          quantity_received: number
          quantity_remaining: number
          quarantine_reason?: string | null
          receipt_id?: string | null
          received_date: string
          source_lot_id?: string | null
          status?: Database["public"]["Enums"]["lot_status"]
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiration_date?: string | null
          id?: string
          location_id?: string
          lot_number?: string
          manufacture_date?: string | null
          organization_id?: string
          product_id?: string
          purchase_order_id?: string | null
          quantity_received?: number
          quantity_remaining?: number
          quarantine_reason?: string | null
          receipt_id?: string | null
          received_date?: string
          source_lot_id?: string | null
          status?: Database["public"]["Enums"]["lot_status"]
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_purchase_order_id_fkey"
            columns: ["organization_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_receipt_id_fkey"
            columns: ["organization_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_source_lot_id_fkey"
            columns: ["organization_id", "source_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          after_quantity: number
          before_quantity: number
          created_at: string
          id: string
          location_id: string
          lot_id: string | null
          organization_id: string
          performed_by: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          unit_cost: number | null
        }
        Insert: {
          after_quantity: number
          before_quantity: number
          created_at?: string
          id?: string
          location_id: string
          lot_id?: string | null
          organization_id: string
          performed_by?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          unit_cost?: number | null
        }
        Update: {
          after_quantity?: number
          before_quantity?: number
          created_at?: string
          id?: string
          location_id?: string
          lot_id?: string | null
          organization_id?: string
          performed_by?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_transactions_organization_id_lot_id_fkey"
            columns: ["organization_id", "lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_transactions_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
          postal_code: string | null
          prefecture: string | null
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_demo_readonly: boolean
          name: string
          overstock_days: number
          review_period_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo_readonly?: boolean
          name: string
          overstock_days?: number
          review_period_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo_readonly?: boolean
          name?: string
          overstock_days?: number
          review_period_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_suppliers: {
        Row: {
          created_at: string
          is_primary: boolean
          lead_time_days: number | null
          minimum_order_quantity: number | null
          order_lot_size: number | null
          organization_id: string
          product_id: string
          purchase_price: number | null
          supplier_id: string
          supplier_product_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          order_lot_size?: number | null
          organization_id: string
          product_id: string
          purchase_price?: number | null
          supplier_id: string
          supplier_product_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          lead_time_days?: number | null
          minimum_order_quantity?: number | null
          order_lot_size?: number | null
          organization_id?: string
          product_id?: string
          purchase_price?: number | null
          supplier_id?: string
          supplier_product_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "product_suppliers_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          content_amount: number | null
          content_unit: string | null
          cost_price: number
          created_at: string
          expiration_warning_days: number
          id: string
          is_active: boolean
          jan_code: string | null
          lead_time_days: number
          manufacturer: string | null
          minimum_order_quantity: number
          notes: string | null
          order_lot_size: number
          organization_id: string
          primary_supplier_id: string | null
          product_name: string
          product_name_kana: string | null
          purchase_unit: string
          reorder_point: number
          safety_stock: number
          sales_unit: string
          search_text: string | null
          selling_price: number
          shelf_life_days: number | null
          sku: string
          specification: string | null
          standard_order_quantity: number
          storage_location_note: string | null
          storage_temperature_max: number | null
          storage_temperature_min: number | null
          storage_type: Database["public"]["Enums"]["storage_type"]
          subcategory_id: string | null
          tax_rate: number
          units_per_case: number
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          content_amount?: number | null
          content_unit?: string | null
          cost_price?: number
          created_at?: string
          expiration_warning_days?: number
          id?: string
          is_active?: boolean
          jan_code?: string | null
          lead_time_days?: number
          manufacturer?: string | null
          minimum_order_quantity?: number
          notes?: string | null
          order_lot_size?: number
          organization_id: string
          primary_supplier_id?: string | null
          product_name: string
          product_name_kana?: string | null
          purchase_unit?: string
          reorder_point?: number
          safety_stock?: number
          sales_unit?: string
          search_text?: string | null
          selling_price?: number
          shelf_life_days?: number | null
          sku: string
          specification?: string | null
          standard_order_quantity?: number
          storage_location_note?: string | null
          storage_temperature_max?: number | null
          storage_temperature_min?: number | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          subcategory_id?: string | null
          tax_rate?: number
          units_per_case?: number
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          content_amount?: number | null
          content_unit?: string | null
          cost_price?: number
          created_at?: string
          expiration_warning_days?: number
          id?: string
          is_active?: boolean
          jan_code?: string | null
          lead_time_days?: number
          manufacturer?: string | null
          minimum_order_quantity?: number
          notes?: string | null
          order_lot_size?: number
          organization_id?: string
          primary_supplier_id?: string | null
          product_name?: string
          product_name_kana?: string | null
          purchase_unit?: string
          reorder_point?: number
          safety_stock?: number
          sales_unit?: string
          search_text?: string | null
          selling_price?: number
          shelf_life_days?: number | null
          sku?: string
          specification?: string | null
          standard_order_quantity?: number
          storage_location_note?: string | null
          storage_temperature_max?: number | null
          storage_temperature_min?: number | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          subcategory_id?: string | null
          tax_rate?: number
          units_per_case?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_category_id_fkey"
            columns: ["organization_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_primary_supplier_id_fkey"
            columns: ["organization_id", "primary_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "products_organization_id_subcategory_id_fkey"
            columns: ["organization_id", "subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_demo: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          is_demo?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_demo?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          ai_reason: string | null
          ai_recommended_quantity: number | null
          created_at: string
          id: string
          ordered_quantity: number
          organization_id: string
          product_id: string
          purchase_order_id: string
          received_quantity: number
          subtotal: number | null
          tax_rate: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          ai_reason?: string | null
          ai_recommended_quantity?: number | null
          created_at?: string
          id?: string
          ordered_quantity: number
          organization_id: string
          product_id: string
          purchase_order_id: string
          received_quantity?: number
          subtotal?: number | null
          tax_rate?: number
          unit_cost: number
          updated_at?: string
        }
        Update: {
          ai_reason?: string | null
          ai_recommended_quantity?: number | null
          created_at?: string
          id?: string
          ordered_quantity?: number
          organization_id?: string
          product_id?: string
          purchase_order_id?: string
          received_quantity?: number
          subtotal?: number | null
          tax_rate?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_order_items_organization_id_purchase_order_id_fkey"
            columns: ["organization_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          location_id: string
          notes: string | null
          order_date: string
          order_number: string
          ordered_at: string | null
          organization_id: string
          received_at: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          location_id: string
          notes?: string | null
          order_date?: string
          order_number: string
          ordered_at?: string | null
          organization_id: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          ordered_at?: string | null
          organization_id?: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          purchase_order_id: string | null
          receipt_number: string
          received_date: string
          supplier_id: string | null
          total_amount: number
          total_quantity: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          purchase_order_id?: string | null
          receipt_number: string
          received_date: string
          supplier_id?: string | null
          total_amount?: number
          total_quantity?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          purchase_order_id?: string | null
          receipt_number?: string
          received_date?: string
          supplier_id?: string | null
          total_amount?: number
          total_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "receipts_organization_id_purchase_order_id_fkey"
            columns: ["organization_id", "purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "receipts_organization_id_supplier_id_fkey"
            columns: ["organization_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      stock_issues: {
        Row: {
          created_at: string
          created_by: string | null
          destination_location_id: string | null
          id: string
          issue_number: string
          issue_type: Database["public"]["Enums"]["issue_type"]
          location_id: string
          notes: string | null
          organization_id: string
          total_quantity: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination_location_id?: string | null
          id?: string
          issue_number: string
          issue_type: Database["public"]["Enums"]["issue_type"]
          location_id: string
          notes?: string | null
          organization_id: string
          total_quantity?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination_location_id?: string | null
          id?: string
          issue_number?: string
          issue_type?: Database["public"]["Enums"]["issue_type"]
          location_id?: string
          notes?: string | null
          organization_id?: string
          total_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_organization_id_destination_location_id_fkey"
            columns: ["organization_id", "destination_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "stock_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_issues_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      stocktake_items: {
        Row: {
          actual_quantity: number | null
          adjusted_quantity: number | null
          counted_at: string | null
          counted_by: string | null
          difference_quantity: number | null
          expected_quantity: number
          id: string
          organization_id: string
          product_id: string
          reason: string | null
          stocktake_id: string
        }
        Insert: {
          actual_quantity?: number | null
          adjusted_quantity?: number | null
          counted_at?: string | null
          counted_by?: string | null
          difference_quantity?: number | null
          expected_quantity: number
          id?: string
          organization_id: string
          product_id: string
          reason?: string | null
          stocktake_id: string
        }
        Update: {
          actual_quantity?: number | null
          adjusted_quantity?: number | null
          counted_at?: string | null
          counted_by?: string | null
          difference_quantity?: number | null
          expected_quantity?: number
          id?: string
          organization_id?: string
          product_id?: string
          reason?: string | null
          stocktake_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_items_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "stocktake_items_organization_id_stocktake_id_fkey"
            columns: ["organization_id", "stocktake_id"]
            isOneToOne: false
            referencedRelation: "stocktakes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      stocktakes: {
        Row: {
          category_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          started_at: string
          status: Database["public"]["Enums"]["stocktake_status"]
          stocktake_number: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["stocktake_status"]
          stocktake_number: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["stocktake_status"]
          stocktake_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stocktakes_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktakes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktakes_organization_id_category_id_fkey"
            columns: ["organization_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "stocktakes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktakes_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          minimum_order_amount: number
          notes: string | null
          organization_id: string
          payment_terms: string | null
          phone: string | null
          postal_code: string | null
          prefecture: string | null
          standard_lead_time_days: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          minimum_order_amount?: number
          notes?: string | null
          organization_id: string
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          standard_lead_time_days?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          minimum_order_amount?: number
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          standard_lead_time_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_records: {
        Row: {
          cost_amount: number
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          lot_id: string | null
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          reason: Database["public"]["Enums"]["waste_reason"]
          waste_date: string
        }
        Insert: {
          cost_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          lot_id?: string | null
          notes?: string | null
          organization_id: string
          product_id: string
          quantity: number
          reason: Database["public"]["Enums"]["waste_reason"]
          waste_date: string
        }
        Update: {
          cost_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          lot_id?: string | null
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          reason?: Database["public"]["Enums"]["waste_reason"]
          waste_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_records_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "waste_records_organization_id_lot_id_fkey"
            columns: ["organization_id", "lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "waste_records_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_organization_member: {
        Args: {
          p_email: string
          p_organization_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: string
      }
      cancel_stocktake: { Args: { p_stocktake_id: string }; Returns: undefined }
      complete_stocktake: { Args: { p_stocktake_id: string }; Returns: number }
      create_organization: {
        Args: {
          p_location_code: string
          p_location_name: string
          p_location_type: Database["public"]["Enums"]["location_type"]
          p_name: string
        }
        Returns: string
      }
      create_purchase_order: {
        Args: {
          p_expected_delivery_date?: string
          p_items: Json
          p_location_id: string
          p_notes?: string
          p_organization_id: string
          p_submit?: boolean
          p_supplier_id: string
        }
        Returns: string
      }
      create_purchase_orders_from_recommendations: {
        Args: {
          p_items: Json
          p_location_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      create_stocktake: {
        Args: {
          p_category_id?: string
          p_location_id: string
          p_notes?: string
          p_organization_id: string
        }
        Returns: string
      }
      get_dashboard_summary: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      get_reorder_inputs: {
        Args: {
          p_location_id?: string
          p_organization_id: string
          p_product_id?: string
        }
        Returns: {
          category_name: string
          cost_price: number
          expiration_warning_days: number
          expired_quantity: number
          first_received_date: string
          incoming_quantity: number
          jan_code: string
          lead_time_days: number
          location_id: string
          location_name: string
          minimum_order_quantity: number
          next_delivery_date: string
          order_lot_size: number
          product_id: string
          product_name: string
          quantity_available: number
          quantity_on_hand: number
          quantity_reserved: number
          quarantined_quantity: number
          reorder_point: number
          safety_stock: number
          sales_unit: string
          shelf_life_days: number
          sku: string
          standard_order_quantity: number
          storage_type: Database["public"]["Enums"]["storage_type"]
          supplier_id: string
          supplier_name: string
          units_per_case: number
          usable_lots: Json
          usage_30d: number
          usage_7d: number
          usage_by_weekday: number[]
          waste_30d: number
        }[]
      }
      issue_stock: {
        Args: {
          p_destination_location_id?: string
          p_issue_type: Database["public"]["Enums"]["issue_type"]
          p_items: Json
          p_location_id: string
          p_notes?: string
          p_organization_id: string
        }
        Returns: string
      }
      receive_stock: {
        Args: {
          p_items: Json
          p_location_id: string
          p_notes?: string
          p_organization_id: string
          p_purchase_order_id?: string
          p_received_date: string
          p_supplier_id?: string
        }
        Returns: string
      }
      record_waste: {
        Args: {
          p_location_id: string
          p_lot_id?: string
          p_notes?: string
          p_organization_id: string
          p_product_id: string
          p_quantity: number
          p_reason: Database["public"]["Enums"]["waste_reason"]
          p_waste_date: string
        }
        Returns: number
      }
      remove_organization_member: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
      save_stocktake_counts: {
        Args: { p_items: Json; p_stocktake_id: string }
        Returns: number
      }
      search_inventory: {
        Args: {
          p_category_id?: string
          p_limit?: number
          p_location_id?: string
          p_offset?: number
          p_organization_id: string
          p_query?: string
          p_query_alt?: string
          p_stock_status?: string
          p_storage_type?: Database["public"]["Enums"]["storage_type"]
        }
        Returns: {
          avg_daily_usage: number
          category_name: string
          expired_quantity: number
          expiring_quantity: number
          inventory_value: number
          location_id: string
          location_name: string
          nearest_expiration_date: string
          product_id: string
          product_name: string
          quantity_available: number
          quantity_on_hand: number
          quantity_reserved: number
          reorder_point: number
          safety_stock: number
          sales_unit: string
          sku: string
          stock_status: string
          storage_type: Database["public"]["Enums"]["storage_type"]
          total_count: number
          updated_at: string
        }[]
      }
      search_lots: {
        Args: {
          p_limit?: number
          p_location_id?: string
          p_offset?: number
          p_organization_id: string
          p_query?: string
          p_query_alt?: string
          p_status?: string
          p_storage_type?: Database["public"]["Enums"]["storage_type"]
        }
        Returns: {
          days_until_expiration: number
          effective_status: string
          expiration_date: string
          id: string
          location_id: string
          location_name: string
          lot_number: string
          manufacture_date: string
          product_id: string
          product_name: string
          quantity_received: number
          quantity_remaining: number
          quarantine_reason: string
          received_date: string
          sales_unit: string
          sku: string
          status: Database["public"]["Enums"]["lot_status"]
          storage_type: Database["public"]["Enums"]["storage_type"]
          supplier_name: string
          total_count: number
          unit_cost: number
        }[]
      }
      search_products: {
        Args: {
          p_category_id?: string
          p_is_active?: boolean
          p_limit?: number
          p_location_id?: string
          p_offset?: number
          p_organization_id: string
          p_query?: string
          p_query_alt?: string
          p_sort?: string
          p_stock_status?: string
          p_storage_type?: Database["public"]["Enums"]["storage_type"]
          p_supplier_id?: string
        }
        Returns: {
          avg_daily_usage: number
          brand: string
          category_name: string
          cost_price: number
          id: string
          is_active: boolean
          jan_code: string
          manufacturer: string
          product_name: string
          product_name_kana: string
          quantity_available: number
          quantity_on_hand: number
          reorder_point: number
          safety_stock: number
          sales_unit: string
          selling_price: number
          sku: string
          stock_status: string
          storage_type: Database["public"]["Enums"]["storage_type"]
          subcategory_name: string
          supplier_name: string
          total_count: number
        }[]
      }
      set_lot_quarantine: {
        Args: { p_lot_id: string; p_quarantined: boolean; p_reason?: string }
        Returns: undefined
      }
      set_purchase_order_status: {
        Args: {
          p_purchase_order_id: string
          p_status: Database["public"]["Enums"]["purchase_order_status"]
        }
        Returns: undefined
      }
      update_organization_member_role: {
        Args: {
          p_organization_id: string
          p_role: Database["public"]["Enums"]["member_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      update_purchase_order_draft: {
        Args: {
          p_expected_delivery_date?: string
          p_items: Json
          p_notes?: string
          p_purchase_order_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      issue_type: "sale" | "usage" | "transfer"
      location_type: "store" | "warehouse"
      lot_status:
        | "available"
        | "expiring_soon"
        | "expired"
        | "depleted"
        | "quarantined"
      member_role: "owner" | "admin" | "inventory_manager" | "staff" | "viewer"
      purchase_order_status:
        | "draft"
        | "ordered"
        | "partially_received"
        | "received"
        | "cancelled"
      stocktake_status: "in_progress" | "completed" | "cancelled"
      storage_type: "room_temperature" | "refrigerated" | "frozen"
      transaction_type:
        | "receipt"
        | "sale"
        | "usage"
        | "transfer_in"
        | "transfer_out"
        | "adjustment_plus"
        | "adjustment_minus"
        | "waste"
        | "stocktake_adjustment"
      waste_reason:
        | "expired"
        | "damaged"
        | "quality_issue"
        | "overstock"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      issue_type: ["sale", "usage", "transfer"],
      location_type: ["store", "warehouse"],
      lot_status: [
        "available",
        "expiring_soon",
        "expired",
        "depleted",
        "quarantined",
      ],
      member_role: ["owner", "admin", "inventory_manager", "staff", "viewer"],
      purchase_order_status: [
        "draft",
        "ordered",
        "partially_received",
        "received",
        "cancelled",
      ],
      stocktake_status: ["in_progress", "completed", "cancelled"],
      storage_type: ["room_temperature", "refrigerated", "frozen"],
      transaction_type: [
        "receipt",
        "sale",
        "usage",
        "transfer_in",
        "transfer_out",
        "adjustment_plus",
        "adjustment_minus",
        "waste",
        "stocktake_adjustment",
      ],
      waste_reason: [
        "expired",
        "damaged",
        "quality_issue",
        "overstock",
        "other",
      ],
    },
  },
} as const

