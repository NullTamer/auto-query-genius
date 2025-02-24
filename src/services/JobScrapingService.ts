
import { supabase } from "@/integrations/supabase/client";
import type { JobSource, JobPosting, ExtractedKeyword } from "@/custom/supabase-types";

export class JobScrapingService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;
  private static readonly TIMEOUT = 30000; // 30 seconds timeout

  static async processJobPosting(jobDescription: string, sourceId: string): Promise<string> {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('User must be authenticated to process job postings');
      }

      const userId = session.data.session.user.id;

      // Create initial job posting record
      const { data: jobPosting, error: insertError } = await supabase
        .from('job_postings')
        .insert({
          source_id: sourceId,
          user_id: userId, // Set the user_id
          title: 'Processing...',
          description: jobDescription,
          posting_url: 'direct-input',
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError || !jobPosting) {
        console.error('Insert error:', insertError);
        throw new Error(`Failed to create job posting: ${insertError?.message}`);
      }

      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), this.TIMEOUT);
      });

      // Process with timeout
      const scrapePromise = supabase.functions.invoke('scrape-job-posting', {
        body: { 
          jobDescription,
          jobPostingId: jobPosting.id 
        }
      });

      // Race between the scrape and timeout
      const { data: scrapeData, error: scrapeError } = await Promise.race([
        scrapePromise,
        timeoutPromise
      ]) as any;

      if (scrapeError) {
        await this.updateJobPostingStatus(jobPosting.id, 'failed');
        throw new Error(`Processing failed: ${scrapeError.message}`);
      }

      console.log('Job posting processed successfully:', scrapeData);
      return jobPosting.id;

    } catch (error) {
      console.error('Error processing job posting:', error);
      throw error;
    }
  }

  static async updateJobPostingStatus(
    postingId: string,
    status: JobPosting['status'],
    details?: Partial<JobPosting>
  ): Promise<void> {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('User must be authenticated to update job postings');
      }

      const { error } = await supabase
        .from('job_postings')
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...details
        })
        .eq('id', postingId)
        .eq('user_id', session.data.session.user.id); // Ensure we only update user's own posts

      if (error) throw error;
    } catch (error) {
      console.error('Error updating job posting status:', error);
      throw error;
    }
  }

  static async retryJobPosting(jobPostingId: string): Promise<void> {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('User must be authenticated to retry job postings');
      }

      const { data: jobPosting, error: fetchError } = await supabase
        .from('job_postings')
        .select('*')
        .eq('id', jobPostingId)
        .eq('user_id', session.data.session.user.id) // Only fetch user's own posts
        .single();

      if (fetchError || !jobPosting) {
        throw new Error('Failed to fetch job posting for retry');
      }

      await this.updateJobPostingStatus(jobPostingId, 'pending');

      const { error: scrapeError } = await supabase.functions.invoke('scrape-job-posting', {
        body: { 
          jobDescription: jobPosting.description,
          jobPostingId: jobPosting.id 
        }
      });

      if (scrapeError) throw scrapeError;

    } catch (error) {
      console.error('Error retrying job posting:', error);
      throw error;
    }
  }
}
