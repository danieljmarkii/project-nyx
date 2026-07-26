-- B-416 rollback — restores the exact pre-backfill values of every row the
-- forward pass touched. Generated from the same input, so it is only valid
-- against a database the forward pass has been applied to unchanged.

BEGIN;
UPDATE food_items SET primary_protein = 'duck', proteins = ARRAY['duck']::text[] WHERE id = '814ded7d-2e84-4ecc-84c7-484ac19a6bb5';
UPDATE food_items SET primary_protein = 'ocean whitefish', proteins = ARRAY['ocean whitefish']::text[] WHERE id = 'df83b25b-c3d4-4add-b58e-c8ea4f8d19ba';
UPDATE food_items SET primary_protein = 'beef', proteins = ARRAY['beef']::text[] WHERE id = '44f5d21d-9927-438a-8090-8ab5b0b322db';
UPDATE food_items SET primary_protein = 'beef', proteins = ARRAY['beef']::text[] WHERE id = '4d0ef2e8-5950-4b35-addc-f071ee0f6898';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = 'b7928207-7407-41bf-bea2-b2173dbfc157';
UPDATE food_items SET primary_protein = 'ocean whitefish', proteins = ARRAY['ocean whitefish']::text[] WHERE id = '6ed27386-b33b-4d9e-8be4-eb8e64cb336e';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '36fce973-35cb-4aee-b741-4087ff784341';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '040e864c-bc1c-4e8d-ba12-687e64fac351';
UPDATE food_items SET primary_protein = 'duck', proteins = ARRAY['duck']::text[] WHERE id = 'f1239932-a8f6-4165-9ebd-462a242ae7d7';
UPDATE food_items SET primary_protein = 'tuna', proteins = ARRAY['tuna']::text[] WHERE id = 'b20c19a0-1ec6-4b8a-b748-67098b7fade4';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '887deaae-8724-42b4-9146-b0141605ca8d';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '13b0c9f9-0914-4fd4-a91b-caead2d9015a';
UPDATE food_items SET primary_protein = 'ocean whitefish', proteins = ARRAY['ocean whitefish']::text[] WHERE id = '72a52afb-ddfc-40ce-b929-124b8562cd2c';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '2069a396-0ab3-4e7c-907f-1caf50198f37';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '1982a8f9-d5fc-4ea4-95b7-e0a3a57d933f';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '0446cbf8-0c48-49e5-8076-874cb2d8f96c';
UPDATE food_items SET primary_protein = 'turkey by-product meal', proteins = ARRAY['turkey']::text[] WHERE id = '6edfb506-8943-4374-956a-354c2974950f';
UPDATE food_items SET primary_protein = 'chicken by-product meal', proteins = ARRAY['chicken']::text[] WHERE id = 'ef30f24b-58ba-4ffd-9eef-d7cd62ee63f0';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = 'b67b2819-79e4-48d0-85c8-06a60a2d7a01';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = 'aca34504-fb3c-4e0f-9770-d78b05afbf81';
UPDATE food_items SET primary_protein = 'rabbit', proteins = '{}'::text[] WHERE id = 'aa4f500e-dd63-447f-ba9f-590438470ab7';
UPDATE food_items SET primary_protein = 'Rabbit', proteins = ARRAY['rabbit']::text[] WHERE id = '53dfa6ae-b1ea-4ba8-a17c-d847e87e3489';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '8c5db43a-0fe1-4323-a905-d294d85dde81';
UPDATE food_items SET primary_protein = 'turkey', proteins = ARRAY['turkey']::text[] WHERE id = 'bf51b6b8-c6e5-477c-9504-4b71c3a92db8';
UPDATE food_items SET primary_protein = 'Chicken By-Product Meal', proteins = ARRAY['chicken']::text[] WHERE id = '3e0e5cdc-2ad0-4e65-8769-0d007ee13bf3';
UPDATE food_items SET primary_protein = 'Chicken By-Product Meal', proteins = ARRAY['chicken']::text[] WHERE id = '97608e03-e947-44f4-bfa3-da9d4d87cb2d';
UPDATE food_items SET primary_protein = 'Chicken By-Product Meal', proteins = ARRAY['chicken']::text[] WHERE id = '861ab2e1-13d6-4189-87cc-ac4a3d89a191';
UPDATE food_items SET primary_protein = 'rabbit', proteins = ARRAY['rabbit']::text[] WHERE id = 'ff2e30b1-3b82-4b5e-97fc-0c598f564221';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '90fea001-850c-4943-b47b-0f19860029f5';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '1cb64256-3a36-4c45-ad9a-91ae4ce4703e';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '5fafd7a2-fdb1-4804-abf7-a8ec6012116d';
UPDATE food_items SET primary_protein = 'Chicken', proteins = ARRAY['chicken']::text[] WHERE id = '69e79e22-5363-4a2b-8030-8e8e86e3be4d';
UPDATE food_items SET primary_protein = 'tuna', proteins = ARRAY['tuna']::text[] WHERE id = '4d4ec124-8df6-4c39-ac82-9a1e1c69bed3';
UPDATE food_items SET primary_protein = 'chicken', proteins = ARRAY['chicken']::text[] WHERE id = '1bb45817-ac08-4b00-accd-8c98ca6893a7';
UPDATE food_items SET primary_protein = 'lamb', proteins = ARRAY['lamb']::text[] WHERE id = '07cae434-0c0b-4f10-a613-d3a66e1efc50';
COMMIT;
