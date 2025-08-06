#!/usr/bin/env bun
/**
 * Setup database tables using Supabase client
 * Run this script to create all necessary tables
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://khhvrwomoghmwhfxlnky.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoaHZyd29tb2dobXdoZnhsbmt5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQ2OTAzMSwiZXhwIjoyMDcwMDQ1MDMxfQ.k9xA43lor8LflNWYnzfErpXkJMkN5t6RNp16DuYxdqw';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setupDatabase() {
  try {
    console.log('🚀 Setting up database tables...\n');

    // Read the migration file
    const migrationPath = join(process.cwd(), 'supabase/migrations/20250806092049_initial_schema.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Split the SQL into individual statements (basic split, might need refinement)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip if it's just a comment
      if (statement.trim().startsWith('--')) continue;

      // Extract a description of what we're doing
      let description = 'SQL statement';
      if (statement.includes('CREATE TABLE')) {
        const match = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)/i);
        if (match) description = `Create table: ${match[1]}`;
      } else if (statement.includes('CREATE INDEX')) {
        const match = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/i);
        if (match) description = `Create index: ${match[1]}`;
      } else if (statement.includes('CREATE TRIGGER')) {
        const match = statement.match(/CREATE TRIGGER (\w+)/i);
        if (match) description = `Create trigger: ${match[1]}`;
      } else if (statement.includes('CREATE POLICY')) {
        const match = statement.match(/CREATE POLICY "([^"]+)"/i);
        if (match) description = `Create policy: ${match[1]}`;
      } else if (statement.includes('CREATE EXTENSION')) {
        const match = statement.match(/CREATE EXTENSION (?:IF NOT EXISTS )?"?(\w+)"?/i);
        if (match) description = `Create extension: ${match[1]}`;
      } else if (statement.includes('ALTER TABLE')) {
        const match = statement.match(/ALTER TABLE (?:public\.)?(\w+)/i);
        if (match) description = `Alter table: ${match[1]}`;
      }

      process.stdout.write(`[${i + 1}/${statements.length}] ${description}... `);

      const { error } = await supabase.rpc('exec_sql', {
        sql: statement
      }).single();

      if (error) {
        // Try direct execution as alternative
        const { error: directError } = await supabase.from('_sql').select(statement);
        
        if (directError) {
          console.log('❌');
          console.error(`   Error: ${directError.message}`);
          errorCount++;
        } else {
          console.log('✅');
          successCount++;
        }
      } else {
        console.log('✅');
        successCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    if (errorCount > 0) {
      console.log('\n⚠️  Some statements failed. This might be because:');
      console.log('   - Tables already exist');
      console.log('   - Extensions need to be enabled in the dashboard');
      console.log('   - RLS policies might need admin access');
      console.log('\n💡 Try running the migration directly in the Supabase SQL Editor for better error messages');
    } else {
      console.log('\n✨ Database setup completed successfully!');
    }

  } catch (error) {
    console.error('❌ Failed to setup database:', error);
    console.log('\n💡 Alternative: Copy the contents of supabase/migrations/20250806092049_initial_schema.sql');
    console.log('   and run it in the Supabase SQL Editor at:');
    console.log('   https://supabase.com/dashboard/project/khhvrwomoghmwhfxlnky/sql');
  }
}

// Run the setup
setupDatabase();