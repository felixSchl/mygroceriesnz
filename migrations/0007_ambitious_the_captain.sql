-- -------------------------
-- MANUAL SQL MIGRATION FILE
-- -------------------------
-- Validate GTIN barcodes
-- Source: https://www.postgresql.org/message-id/59b2d39b05062422444ede36a8%40mail.gmail.com
CREATE OR REPLACE FUNCTION valid_barcode(barcode text) RETURNS boolean AS $function$
DECLARE b text;
odd int;
even int;
s int;
BEGIN IF LENGTH(barcode) < 12
OR LENGTH(barcode) > 13 THEN return false;
END IF;
-- normalize UPC and EAN to both be 13 digits
IF LENGTH(barcode) = 12 THEN b = '0' || barcode;
ELSE b = barcode;
END IF;
-- sum of odd digits times 3, plus sum of even digits
even = CAST(SUBSTR(b, 1, 1) AS int) + CAST(SUBSTR(b, 3, 1) AS int) + CAST(SUBSTR(b, 5, 1) AS int) + CAST(SUBSTR(b, 7, 1) AS int) + CAST(SUBSTR(b, 9, 1) AS int) + CAST(SUBSTR(b, 11, 1) AS int);
odd = CAST(SUBSTR(b, 2, 1) AS int) + CAST(SUBSTR(b, 4, 1) AS int) + CAST(SUBSTR(b, 6, 1) AS int) + CAST(SUBSTR(b, 8, 1) AS int) + CAST(SUBSTR(b, 10, 1) AS int) + CAST(SUBSTR(b, 12, 1) AS int);
s = (3 * odd) + even;
-- remainder to nearest 10 should be same as last check digit
IF (
  CAST((CEIL(CAST(s AS float8) / 10) * 10) AS int) % s
) = CAST(SUBSTR(b, 13, 1) AS int) THEN return true;
ELSE return false;
END IF;
END;
$function$ LANGUAGE plpgsql;