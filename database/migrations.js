'use strict';

function runSqliteMigrations(ensureColumn) {
  ensureColumn('users', 'role', "TEXT DEFAULT 'admin'");
  ensureColumn('clients', 'address', 'TEXT');
  ensureColumn('clients', 'postal_code', 'TEXT');
  ensureColumn('clients', 'city', 'TEXT');
  ensureColumn('clients', 'email', 'TEXT');
  ensureColumn('clients', 'phone', 'TEXT');
  ensureColumn('clients', 'created_at', 'TEXT');
  ensureColumn('events', 'type', 'TEXT');
  ensureColumn('events', 'google_event_id', 'TEXT NULL');
  ensureColumn('client_orders', 'planned_hours', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'done_hours', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'chantier_status', "TEXT DEFAULT 'À préparer'");
  ensureColumn('client_orders', 'chantier_start_date', 'TEXT');
  ensureColumn('client_orders', 'chantier_end_date', 'TEXT');
  ensureColumn('client_orders', 'chantier_progress', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'chantier_notes', 'TEXT');
  ensureColumn('client_orders', 'status', 'TEXT');
  ensureColumn('client_orders', 'vat_rate', 'REAL NULL');
  ensureColumn('supplier_orders', 'status', 'TEXT');
  ensureColumn('chantier_hours', 'client_order_id', 'INTEGER NULL');
  ensureColumn('client_order_purchases', 'client_order_id', 'INTEGER');
  ensureColumn('client_order_purchases', 'designation', 'TEXT');
  ensureColumn('client_order_purchases', 'category', 'TEXT');
  ensureColumn('client_order_purchases', 'qty', 'REAL DEFAULT 1');
  ensureColumn('client_order_purchases', 'unit', 'TEXT');
  ensureColumn('client_order_purchases', 'reference', 'TEXT');
  ensureColumn('client_order_purchases', 'supplier', 'TEXT');
  ensureColumn('client_order_purchases', 'needed_date', 'TEXT');
  ensureColumn('client_order_purchases', 'note', 'TEXT');
  ensureColumn('client_order_purchases', 'status', "TEXT DEFAULT 'À commander'");
  ensureColumn('client_order_purchases', 'created_at', 'TEXT');
  ensureColumn('client_order_purchases', 'updated_at', 'TEXT');
  ensureColumn('client_order_invoices', 'source_type', "TEXT DEFAULT 'upload'");
  ensureColumn('tasks', 'status', 'TEXT');
  ensureColumn('tasks', 'to_invoice', 'INTEGER DEFAULT 0');
  ensureColumn('quotes', 'title', 'TEXT');
  ensureColumn('quotes', 'client_name', 'TEXT');
  ensureColumn('quotes', 'client_email', 'TEXT');
  ensureColumn('quotes', 'client_phone', 'TEXT');
  ensureColumn('quotes', 'client_address', 'TEXT');
  ensureColumn('quotes', 'status', 'TEXT');
  ensureColumn('quotes', 'created_at', 'TEXT');
  ensureColumn('quotes', 'vat_rate', 'REAL DEFAULT 20');
  ensureColumn('quotes', 'margin_pct', 'REAL');
  ensureColumn('quotes', 'notes', 'TEXT');
  ensureColumn('quotes', 'photos', 'TEXT');
  ensureColumn('quotes', 'cout_revient', 'REAL');
  ensureColumn('quotes', 'cout_matiere', 'REAL');
  ensureColumn('quotes', 'cout_sous_traitance', 'REAL');
  ensureColumn('quotes', 'cout_galvanisation', 'REAL');
  ensureColumn('quotes', 'cout_thermolaquage', 'REAL');
  ensureColumn('quotes', 'cout_motorisation', 'REAL');
  ensureColumn('quotes', 'cout_accessoires', 'REAL');
  ensureColumn('quotes', 'cout_transport', 'REAL');
  ensureColumn('quotes', 'cout_consommables', 'REAL');
  ensureColumn('quotes', 'cout_locations', 'REAL');
  ensureColumn('quotes', 'heures_etude', 'REAL');
  ensureColumn('quotes', 'heures_atelier', 'REAL');
  ensureColumn('quotes', 'heures_pose', 'REAL');
  ensureColumn('quotes', 'cout_horaire', 'REAL');
  ensureColumn('quotes', 'work_category', 'TEXT');
  ensureColumn('quote_lines', 'cost_unit', 'REAL');
  ensureColumn('quote_lines', 'cost_total', 'REAL');
  ensureColumn('quote_lines', 'margin_pct', 'REAL');
  ensureColumn('quote_lines', 'coefficient', 'REAL');
  ensureColumn('quote_lines', 'hours', 'REAL');
  ensureColumn('quote_lines', 'hourly_cost', 'REAL');
  ensureColumn('quote_lines', 'cost_category', 'TEXT');
  ensureColumn('quote_lines', 'cost_source', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'analysis_json', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'manual_adjustments_json', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'reliability_level', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'analyzed_at', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'engine_version', 'INTEGER');
  ensureColumn('client_orders', 'quote_id', 'INTEGER NULL');
  ensureColumn('client_orders', 'work_category', 'TEXT');
  ensureColumn('chantier_hours', 'category', "TEXT DEFAULT 'autre'");
  ensureColumn('materials', 'type', 'TEXT');
  ensureColumn('materials', 'name', 'TEXT');
  ensureColumn('materials', 'unit', 'TEXT');
  ensureColumn('materials', 'price', 'REAL');
  ensureColumn('materials', 'kg_per_m', 'REAL');
  ensureColumn('materials', 'density', 'REAL');
  ensureColumn('materials', 'created_at', 'TEXT');
  ensureColumn('chantiers', 'name', 'TEXT');
  ensureColumn('chantiers', 'client_id', 'INTEGER');
  ensureColumn('chantiers', 'description', 'TEXT');
  ensureColumn('chantiers', 'status', "TEXT DEFAULT 'À préparer'");
  ensureColumn('chantiers', 'planned_hours', 'REAL DEFAULT 0');
  ensureColumn('chantiers', 'done_hours', 'REAL DEFAULT 0');
  ensureColumn('chantiers', 'start_date', 'TEXT');
  ensureColumn('chantiers', 'end_date', 'TEXT');
  ensureColumn('chantiers', 'created_at', 'TEXT');
  ensureColumn('measurements', 'module', 'TEXT');
  ensureColumn('measurements', 'record_name', 'TEXT');
  ensureColumn('measurements', 'client', 'TEXT');
  ensureColumn('measurements', 'chantier', 'TEXT');
  ensureColumn('measurements', 'measure_date', 'TEXT');
  ensureColumn('measurements', 'quote_id', 'INTEGER NULL');
  ensureColumn('measurements', 'client_order_id', 'INTEGER NULL');
  ensureColumn('measurements', 'data', 'TEXT');
  ensureColumn('measurements', 'created_at', 'TEXT');
  ensureColumn('measurements', 'updated_at', 'TEXT');
}

function runSqliteNormalizations(database) {
  database.prepare(`UPDATE materials SET type = 'tube' WHERE type IS NULL OR type = ''`).run();
  database.prepare(`
    UPDATE users
    SET role = 'admin'
    WHERE username IN ('admin','Bastien')
  `).run();
}


module.exports = { runSqliteMigrations, runSqliteNormalizations };

