import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserFile {
  id: string;
  name: string;
  bucket_id: string;
  created_at: string;
  updated_at: string;
  metadata: {
    size?: number;
    mimetype?: string;
    [key: string]: any;
  };
  url: string;
}

export function useUserFiles() {
  return useQuery({
    queryKey: ['user-files'],
    queryFn: async (): Promise<UserFile[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase.storage
        .from('user-files')
        .list(`${user.id}/`, {
          limit: 100,
          offset: 0,
        });

      if (error) throw error;
      
      const filesWithUrls = data?.map(file => {
        const { data: { publicUrl } } = supabase.storage
          .from('user-files')
          .getPublicUrl(`${user.id}/${file.name}`);

        return {
          id: file.name,
          name: file.name,
          bucket_id: 'user-files',
          created_at: file.created_at || new Date().toISOString(),
          updated_at: file.updated_at || new Date().toISOString(),
          metadata: {
            size: file.metadata?.size || 0,
            mimetype: file.metadata?.mimetype || 'application/octet-stream',
            ...file.metadata
          },
          url: publicUrl
        };
      }) || [];

      return filesWithUrls;
    },
    enabled: true
  });
}

export function useImageFiles() {
  const userFilesQuery = useUserFiles();
  
  return {
    ...userFilesQuery,
    data: userFilesQuery.data?.filter(file => 
      file.metadata.mimetype?.startsWith('image/') || 
      file.metadata.mimetype?.startsWith('video/')
    ) || []
  };
}