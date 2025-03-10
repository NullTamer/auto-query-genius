
import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import debounce from "lodash.debounce";

export interface Keyword {
  keyword: string;
  category?: string;
  frequency: number;
}

export const useKeywords = () => {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [updateCount, setUpdateCount] = useState(0);
  const lastFetchedJobId = useRef<string | null>(null);
  const fetchInProgress = useRef(false);
  const channelRef = useRef<any>(null);
  const retryCount = useRef(0);
  const maxRetries = 10;

  const setupRealtimeSubscription = useCallback((jobId: string) => {
    if (channelRef.current) {
      console.log('Cleaning up existing subscription');
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
    }

    const numericJobId = parseInt(jobId, 10);
    console.log('Setting up realtime subscription for job ID:', numericJobId);
    
    channelRef.current = supabase
      .channel(`keywords-${numericJobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'extracted_keywords',
          filter: `job_posting_id=eq.${numericJobId}`
        },
        (payload) => {
          console.log('Received keywords update:', payload);
          fetchKeywords(jobId);
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          fetchKeywords(jobId);
        }
      });
  }, []);

  const fetchKeywords = async (jobId: string) => {
    if (fetchInProgress.current) {
      console.log('Fetch already in progress, skipping');
      return;
    }

    try {
      fetchInProgress.current = true;
      const numericJobId = parseInt(jobId, 10);
      console.log('Fetching keywords for job ID:', numericJobId);
      
      // Only select columns that exist in the database
      const { data: keywordsData, error } = await supabase
        .from('extracted_keywords')
        .select('keyword, frequency')
        .eq('job_posting_id', numericJobId)
        .order('frequency', { ascending: false });

      if (error) {
        console.error('Error fetching keywords:', error);
        throw error;
      }

      console.log('Raw keywords data:', keywordsData);

      if (keywordsData && keywordsData.length > 0) {
        retryCount.current = 0;
        const formattedKeywords = keywordsData.map(k => ({
          keyword: k.keyword,
          frequency: k.frequency || 1
        }));
        
        console.log('Setting formatted keywords:', formattedKeywords);
        setKeywords(formattedKeywords);
        setUpdateCount(prev => prev + 1);
        lastFetchedJobId.current = jobId;
      } else if (retryCount.current < maxRetries) {
        retryCount.current++;
        console.log(`No keywords found, retry attempt ${retryCount.current} of ${maxRetries}`);
        setTimeout(() => fetchKeywords(jobId), 2000);
      } else {
        console.log('Max retries reached, stopping fetch attempts');
        retryCount.current = 0;
      }
    } catch (error) {
      console.error('Error fetching keywords:', error);
      toast.error('Failed to fetch keywords');
    } finally {
      fetchInProgress.current = false;
    }
  };

  const handleRemoveKeyword = useCallback((keywordToRemove: string) => {
    setKeywords(prev => prev.filter(k => k.keyword !== keywordToRemove));
  }, []);

  const resetKeywords = useCallback(() => {
    setKeywords([]);
    setUpdateCount(0);
    lastFetchedJobId.current = null;
    fetchInProgress.current = false;
    retryCount.current = 0;
    
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  return {
    keywords,
    updateCount,
    debouncedFetchKeywords: useCallback((jobId: string) => {
      setupRealtimeSubscription(jobId);
      fetchKeywords(jobId);
    }, [setupRealtimeSubscription]),
    handleRemoveKeyword,
    resetKeywords
  };
};
