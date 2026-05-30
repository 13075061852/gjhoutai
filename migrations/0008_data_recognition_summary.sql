ALTER TABLE data_recognition_records ADD COLUMN model_code TEXT;
ALTER TABLE data_recognition_records ADD COLUMN batch_code TEXT;

UPDATE data_recognition_records
SET
  model_code = COALESCE(
    NULLIF(json_extract(result_json, '$.rows[0].型号'), ''),
    NULLIF(json_extract(result_json, '$.rows[0].model'), ''),
    NULLIF(json_extract(result_json, '$.rows[0].MODEL'), '')
  ),
  batch_code = COALESCE(
    NULLIF(json_extract(result_json, '$.rows[0].批次'), ''),
    NULLIF(json_extract(result_json, '$.rows[0].batch'), ''),
    NULLIF(json_extract(result_json, '$.rows[0].BATCH'), '')
  )
WHERE model_code IS NULL OR batch_code IS NULL;
