-- Auth providers' user ids aren't all UUIDs: Firebase's and Appwrite's are other strings.
-- Existing UUIDs convert to their text form.
ALTER TABLE "users" ALTER COLUMN "auth_user_id" SET DATA TYPE text USING "auth_user_id"::text;
