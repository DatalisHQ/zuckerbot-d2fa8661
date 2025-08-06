import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useUploadRawAssets() {
  const queryClient = useQueryClient();
  
  return useMutation<string[], Error, File[]>({
    mutationFn: async (files) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const uploads = await Promise.all(
        files.map(async (file) => {
          const fileName = `${Date.now()}_${file.name}`;
          const filePath = `${user.id}/${fileName}`;
          // Debug logging
          console.log('Uploading file:', file.name);
          console.log('User ID:', user.id);
          console.log('File path:', filePath);

          const { data, error } = await supabase.storage
            .from('user-files')
            .upload(filePath, file);
            
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
    onSuccess: () => {
      // Invalidate user files query to refresh the file list
      queryClient.invalidateQueries({ queryKey: ['user-files'] });
    },
  });
}