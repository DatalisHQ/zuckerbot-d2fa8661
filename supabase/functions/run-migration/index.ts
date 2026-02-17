import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("[run-migration] Adding brand_analysis column...");

    // Add brand_analysis column to preview_logs if it doesn't exist
    const { error: alterError } = await supabase.rpc('exec', {
      query: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'preview_logs' 
            AND column_name = 'brand_analysis'
          ) THEN
            ALTER TABLE preview_logs ADD COLUMN brand_analysis JSONB DEFAULT NULL;
          END IF;
        END $$;
      `
    });

    if (alterError) {
      console.error("[run-migration] Error adding column:", alterError);
      // Try direct SQL approach
      const { error: directError } = await supabase
        .from('preview_logs')
        .select('brand_analysis')
        .limit(1);
      
      if (directError && directError.code === '42703') { // Column doesn't exist
        throw new Error("Column doesn't exist and couldn't be added: " + alterError.message);
      }
    }

    console.log("[run-migration] Creating storage bucket...");
    
    // Create storage bucket for generated ads
    const { error: bucketError } = await supabase.storage.createBucket('generated-ads', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });

    if (bucketError && bucketError.message !== 'Bucket already exists') {
      console.error("[run-migration] Bucket creation error:", bucketError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Enhanced preview system migration completed",
        column_added: !alterError,
        bucket_created: !bucketError || bucketError.message === 'Bucket already exists'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[run-migration] Migration failed:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});