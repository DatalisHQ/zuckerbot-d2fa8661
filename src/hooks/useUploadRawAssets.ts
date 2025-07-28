import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useUploadRawAssets() {
  return useMutation<string[], Error, File[]>({
    mutationFn: async (files) => {
      const uploads = await Promise.all(
        files.map(async (file) => {
          const fileName = `ad-assets/${Date.now()}_${file.name}`;
          
          const { data, error } = await supabase.storage
            .from('user-files')
            .upload(fileName, file);
            
          if (error) {
            throw new Error(`Failed to upload ${file.name}: ${error.message}`);
          }

          const { data: { publicUrl } } = supabase.storage
            .from('user-files')
            .getPublicUrl(data.path);
            
          return publicUrl;
        })
      );
      
      return uploads;
    },
  });
}