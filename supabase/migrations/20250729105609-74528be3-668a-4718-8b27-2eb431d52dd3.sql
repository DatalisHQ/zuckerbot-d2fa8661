-- Clean up pending brand analysis records and reset them
UPDATE brand_analysis 
SET analysis_status = 'pending' 
WHERE analysis_status = 'pending' 
AND created_at < NOW() - INTERVAL '1 hour';