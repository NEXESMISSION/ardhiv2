-- ============================================
-- DATABASE RESET WITH TEST DATA
-- Utility Script: Reset database and populate test data
-- ============================================
-- Purpose: Resets database and creates comprehensive test data for development
-- WARNING: This will DELETE ALL DATA except users and roles!
-- Use Case: Development/testing environment setup
-- ============================================
-- WHAT IS KEPT:
-- ✓ users - All user accounts preserved
-- ✓ roles - All roles preserved
--
-- WHAT IS DELETED:
-- ✗ All business data (clients, land, sales, payments, etc.)
--
-- WHAT IS CREATED:
-- ✓ Test clients
-- ✓ Test land batches and pieces
-- ✓ Test sales (full payment and installments)
-- ✓ Test payments and installments
-- ============================================

-- Step 1: Delete all data (keep users and roles)
DELETE FROM payments;
DELETE FROM installments;
DELETE FROM reservations;
DELETE FROM sales;
DELETE FROM land_pieces;
DELETE FROM land_batches;
DELETE FROM clients;
DELETE FROM audit_logs;

-- Step 2: Add is_confirmed column to sales if it doesn't exist
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE;

-- Step 3: Add real_estate_tax_number to land_batches if it doesn't exist
ALTER TABLE land_batches ADD COLUMN IF NOT EXISTS real_estate_tax_number VARCHAR(255);

-- Step 4: Create index for is_confirmed if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_sales_is_confirmed ON sales(is_confirmed);

-- =====================================================
-- TEST DATA CREATION
-- =====================================================

-- Get first user ID for created_by references
DO $$
DECLARE
    first_user_id UUID;
    batch1_id UUID := '00000000-0000-0000-0000-000000000001';
    batch2_id UUID := '00000000-0000-0000-0000-000000000002';
    batch3_id UUID := '00000000-0000-0000-0000-000000000003';
    client1_id UUID := '10000000-0000-0000-0000-000000000001';
    client2_id UUID := '10000000-0000-0000-0000-000000000002';
    client3_id UUID := '10000000-0000-0000-0000-000000000003';
    client4_id UUID := '10000000-0000-0000-0000-000000000004';
    piece1_id UUID;
    piece2_id UUID;
    piece3_id UUID;
    piece4_id UUID;
    piece5_id UUID;
    piece6_id UUID;
    piece7_id UUID;
    piece8_id UUID;
    piece9_id UUID;
    piece10_id UUID;
    piece11_id UUID;
    sale1_id UUID := '20000000-0000-0000-0000-000000000001';
    sale2_id UUID := '20000000-0000-0000-0000-000000000002';
    sale3_id UUID := '20000000-0000-0000-0000-000000000003';
    sale4_id UUID := '20000000-0000-0000-0000-000000000004';
    sale5_id UUID := '20000000-0000-0000-0000-000000000005';
    sale6_id UUID := '20000000-0000-0000-0000-000000000006';
    sale7_id UUID := '20000000-0000-0000-0000-000000000007';
    sale8_id UUID := '20000000-0000-0000-0000-000000000008';
    sale9_id UUID := '20000000-0000-0000-0000-000000000009';
    sale10_id UUID := '20000000-0000-0000-0000-000000000010';
BEGIN
    -- Get first user
    SELECT id INTO first_user_id FROM users LIMIT 1;
    IF first_user_id IS NULL THEN
        RAISE EXCEPTION 'No users found. Please create at least one user first.';
    END IF;
    
    -- =====================================================
    -- 1. LAND BATCHES (3 batches)
    -- =====================================================
    
    INSERT INTO land_batches (id, name, total_surface, total_cost, date_acquired, real_estate_tax_number, notes, created_by) VALUES
    (batch1_id, 'tanyour', 50000, 200000, '2024-01-15', '322552', 'دفعة تانيور - موقع استراتيجي', first_user_id),
    (batch2_id, 'sidi bouzid', 30000, 120000, '2024-03-20', '445123', 'دفعة سيدي بوزيد - منطقة سكنية', first_user_id),
    (batch3_id, 'gafsa', 40000, 160000, '2024-06-10', '556789', 'دفعة قفصة - منطقة تجارية', first_user_id);
    
    -- =====================================================
    -- 2. LAND PIECES (100 pieces total)
    -- =====================================================
    
    -- Batch 1: tanyour - 50 pieces (P001-P050)
    INSERT INTO land_pieces (id, land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    SELECT 
        uuid_generate_v4(),
        batch1_id,
        'P' || LPAD(i::text, 3, '0'),
        400,
        4000,
        4000,
        4500,
        CASE 
            WHEN i <= 20 THEN 'Available'::land_status
            WHEN i <= 30 THEN 'Reserved'::land_status
            WHEN i <= 45 THEN 'Sold'::land_status
            ELSE 'Available'::land_status
        END
    FROM generate_series(1, 50) i;
    
    -- Batch 2: sidi bouzid - 30 pieces (P001-P030)
    INSERT INTO land_pieces (id, land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    SELECT 
        uuid_generate_v4(),
        batch2_id,
        'P' || LPAD(i::text, 3, '0'),
        500,
        5000,
        5000,
        5500,
        CASE 
            WHEN i <= 10 THEN 'Available'::land_status
            WHEN i <= 20 THEN 'Reserved'::land_status
            ELSE 'Sold'::land_status
        END
    FROM generate_series(1, 30) i;
    
    -- Batch 3: gafsa - 20 pieces (P001-P020)
    INSERT INTO land_pieces (id, land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    SELECT 
        uuid_generate_v4(),
        batch3_id,
        'P' || LPAD(i::text, 3, '0'),
        600,
        6000,
        6000,
        6500,
        CASE 
            WHEN i <= 5 THEN 'Available'::land_status
            WHEN i <= 12 THEN 'Reserved'::land_status
            ELSE 'Sold'::land_status
        END
    FROM generate_series(1, 20) i;
    
    -- Get specific piece IDs for sales
    SELECT id INTO piece1_id FROM land_pieces WHERE piece_number = 'P001' AND land_batch_id = batch1_id;
    SELECT id INTO piece2_id FROM land_pieces WHERE piece_number = 'P002' AND land_batch_id = batch1_id;
    SELECT id INTO piece3_id FROM land_pieces WHERE piece_number = 'P021' AND land_batch_id = batch1_id;
    SELECT id INTO piece4_id FROM land_pieces WHERE piece_number = 'P022' AND land_batch_id = batch1_id;
    SELECT id INTO piece5_id FROM land_pieces WHERE piece_number = 'P023' AND land_batch_id = batch1_id;
    SELECT id INTO piece6_id FROM land_pieces WHERE piece_number = 'P024' AND land_batch_id = batch1_id;
    SELECT id INTO piece7_id FROM land_pieces WHERE piece_number = 'P004' AND land_batch_id = batch1_id;
    SELECT id INTO piece8_id FROM land_pieces WHERE piece_number = 'P005' AND land_batch_id = batch1_id;
    SELECT id INTO piece9_id FROM land_pieces WHERE piece_number = 'P006' AND land_batch_id = batch1_id;
    SELECT id INTO piece10_id FROM land_pieces WHERE piece_number = 'P007' AND land_batch_id = batch1_id;
    SELECT id INTO piece11_id FROM land_pieces WHERE piece_number = 'P011' AND land_batch_id = batch1_id;
    
    -- =====================================================
    -- 3. CLIENTS (10 clients)
    -- =====================================================
    
    INSERT INTO clients (id, name, cin, phone, email, address, client_type, notes, created_by) VALUES
    (client1_id, 'haroun', '123456789', '98123456', 'haroun@example.com', 'تونس، المنزه', 'Individual', 'عميل نشط - يفضل الأقساط', first_user_id),
    (client2_id, 'mohamed saif allah elleuchi', '987654321', '98234567', 'mohamed@example.com', 'تونس، الوردية', 'Individual', 'عميل VIP', first_user_id),
    (client3_id, 'abir', '111222333', '98345678', 'abir@example.com', 'تونس، سيدي حسين', 'Individual', NULL, first_user_id),
    ('10000000-0000-0000-0000-000000000004', 'ahmed ben ali', '444555666', '98456789', 'ahmed@example.com', 'صفاقس', 'Individual', 'عميل جديد', first_user_id),
    ('10000000-0000-0000-0000-000000000005', 'fatima zahra', '777888999', '98567890', 'fatima@example.com', 'سوسة', 'Individual', NULL, first_user_id),
    ('10000000-0000-0000-0000-000000000006', 'شركة العقارات المتميزة', 'COMP001', '70123456', 'company@example.com', 'تونس، المركز', 'Company', 'شركة عقارية', first_user_id),
    ('10000000-0000-0000-0000-000000000007', 'youssef trabelsi', '222333444', '98678901', 'youssef@example.com', 'بنزرت', 'Individual', NULL, first_user_id),
    ('10000000-0000-0000-0000-000000000008', 'sara amara', '555666777', '98789012', 'sara@example.com', 'قابس', 'Individual', NULL, first_user_id),
    ('10000000-0000-0000-0000-000000000009', 'khaled bouazizi', '888999000', '98890123', 'khaled@example.com', 'المهدية', 'Individual', NULL, first_user_id),
    ('10000000-0000-0000-0000-000000000010', 'nour hammami', '333444555', '98901234', 'nour@example.com', 'نابل', 'Individual', NULL, first_user_id);
    
    -- =====================================================
    -- 4. RESERVATIONS (2 active reservations)
    -- =====================================================
    
    INSERT INTO reservations (id, client_id, land_piece_ids, small_advance_amount, reservation_date, reserved_until, status, created_by)
    SELECT 
        uuid_generate_v4(),
        client1_id,
        ARRAY[id],
        150.00,
        CURRENT_DATE - INTERVAL '10 days',
        CURRENT_DATE + INTERVAL '20 days',
        'Pending',
        first_user_id
    FROM land_pieces 
    WHERE status = 'Reserved' AND land_batch_id = batch1_id 
    LIMIT 1;
    
    INSERT INTO reservations (id, client_id, land_piece_ids, small_advance_amount, reservation_date, reserved_until, status, created_by)
    SELECT 
        uuid_generate_v4(),
        client2_id,
        ARRAY[id],
        200.00,
        CURRENT_DATE - INTERVAL '5 days',
        CURRENT_DATE + INTERVAL '25 days',
        'Confirmed',
        first_user_id
    FROM land_pieces 
    WHERE status = 'Reserved' AND land_batch_id = batch1_id 
    OFFSET 1 LIMIT 1;
    
    -- =====================================================
    -- 5. SALES (10 sales covering all scenarios)
    -- =====================================================
    
    -- Sale 1: Full Payment - Completed (haroun) - 2 pieces
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type, 
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale1_id,
        client1_id,
        ARRAY[piece3_id, piece4_id],
        'Full',
        8000,
        8000,
        0,
        0,
        0,
        'Completed',
        CURRENT_DATE - INTERVAL '30 days',
        TRUE,
        first_user_id
    );
    
    -- Sale 2: Installments - Pending (haroun) - 2 pieces
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        number_of_installments, monthly_installment_amount,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale2_id,
        client1_id,
        ARRAY[piece1_id, piece2_id],
        'Installment',
        8000,
        9000,
        1000,
        150.00,
        0,
        12,
        750.00,
        'Pending',
        CURRENT_DATE - INTERVAL '2 days',
        FALSE,
        first_user_id
    );
    
    -- Sale 3: Installments - Ongoing (mohamed) - 1 piece
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        number_of_installments, monthly_installment_amount, installment_start_date,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale3_id,
        client2_id,
        ARRAY[piece5_id],
        'Installment',
        4000,
        4500,
        500,
        75.00,
        2000.00,
        12,
        202.08,
        CURRENT_DATE - INTERVAL '3 months',
        'Pending',
        CURRENT_DATE - INTERVAL '3 months',
        TRUE,
        first_user_id
    );
    
    -- Sale 4: Full Payment - Completed (abir)
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale4_id,
        client3_id,
        ARRAY[piece6_id],
        'Full',
        4000,
        4000,
        0,
        50.00,
        0,
        'Completed',
        CURRENT_DATE - INTERVAL '15 days',
        TRUE,
        first_user_id
    );
    
    -- Sale 5: Installments - Ongoing (abir) - 1 piece
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        number_of_installments, monthly_installment_amount, installment_start_date,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale5_id,
        client3_id,
        ARRAY[piece7_id],
        'Installment',
        4000,
        4500,
        500,
        0,
        1500.00,
        18,
        166.67,
        CURRENT_DATE - INTERVAL '2 months',
        'Pending',
        CURRENT_DATE - INTERVAL '2 months',
        TRUE,
        first_user_id
    );
    
    -- Sale 6: Installments - Ongoing (mohamed) - 1 piece
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        number_of_installments, monthly_installment_amount, installment_start_date,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale6_id,
        client2_id,
        ARRAY[piece8_id],
        'Installment',
        4000,
        4500,
        500,
        0,
        2000.00,
        12,
        208.33,
        CURRENT_DATE - INTERVAL '1 month',
        'Pending',
        CURRENT_DATE - INTERVAL '1 month',
        TRUE,
        first_user_id
    );
    
    -- Sale 7: Installments - Ongoing (abir) - 1 piece
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        number_of_installments, monthly_installment_amount, installment_start_date,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale7_id,
        client3_id,
        ARRAY[piece9_id],
        'Installment',
        4000,
        4500,
        500,
        69.50,
        2000.00,
        12,
        202.54,
        CURRENT_DATE - INTERVAL '1 month',
        'Pending',
        CURRENT_DATE - INTERVAL '1 month',
        TRUE,
        first_user_id
    );
    
    -- Sale 8: Full Payment - Completed (mohamed) - 2 pieces
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale8_id,
        client2_id,
        ARRAY[piece10_id, (SELECT id FROM land_pieces WHERE piece_number = 'P008' AND land_batch_id = batch1_id LIMIT 1)],
        'Full',
        8000,
        8000,
        0,
        75.00,
        0,
        'Completed',
        CURRENT_DATE - INTERVAL '20 days',
        TRUE,
        first_user_id
    );
    
    -- Sale 9: Full Payment - Completed (mohamed) - 2 pieces
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale9_id,
        client2_id,
        ARRAY[(SELECT id FROM land_pieces WHERE piece_number = 'P009' AND land_batch_id = batch1_id LIMIT 1), 
              (SELECT id FROM land_pieces WHERE piece_number = 'P010' AND land_batch_id = batch1_id LIMIT 1)],
        'Full',
        8000,
        8000,
        0,
        50.00,
        0,
        'Completed',
        CURRENT_DATE - INTERVAL '25 days',
        TRUE,
        first_user_id
    );
    
    -- Sale 10: Installments - Pending (ahmed)
    INSERT INTO sales (
        id, client_id, land_piece_ids, payment_type,
        total_purchase_cost, total_selling_price, profit_margin,
        small_advance_amount, big_advance_amount,
        number_of_installments, monthly_installment_amount,
        status, sale_date, is_confirmed, created_by
    ) VALUES (
        sale10_id,
        client4_id,
        ARRAY[piece11_id],
        'Installment',
        4000,
        4500,
        500,
        100.00,
        0,
        24,
        183.33,
        'Pending',
        CURRENT_DATE - INTERVAL '1 day',
        FALSE,
        first_user_id
    );
    
    -- =====================================================
    -- 6. INSTALLMENTS (For installment sales)
    -- =====================================================
    
    -- Installments for Sale 3 (mohamed - 12 months, started 3 months ago)
    INSERT INTO installments (sale_id, installment_number, amount_due, amount_paid, stacked_amount, due_date, paid_date, status)
    SELECT 
        sale3_id,
        i,
        202.08,
        CASE 
            WHEN i <= 3 THEN 202.08  -- First 3 paid
            WHEN i = 4 THEN 100.00     -- Partial payment
            ELSE 0
        END,
        CASE 
            WHEN i = 4 THEN 102.08    -- Stacked amount
            ELSE 0
        END,
        (CURRENT_DATE - INTERVAL '3 months' + (i || ' months')::INTERVAL)::DATE,
        CASE 
            WHEN i <= 3 THEN (CURRENT_DATE - INTERVAL '3 months' + (i || ' months')::INTERVAL)::DATE
            WHEN i = 4 THEN NULL
            ELSE NULL
        END,
        CASE 
            WHEN i <= 3 THEN 'Paid'::installment_status
            WHEN i = 4 THEN 'Partial'::installment_status
            WHEN i <= 6 THEN 'Late'::installment_status  -- Overdue
            ELSE 'Unpaid'::installment_status
        END
    FROM generate_series(1, 12) i;
    
    -- Installments for Sale 5 (abir - 18 months, started 2 months ago)
    INSERT INTO installments (sale_id, installment_number, amount_due, amount_paid, stacked_amount, due_date, paid_date, status)
    SELECT 
        sale5_id,
        i,
        166.67,
        CASE 
            WHEN i <= 2 THEN 166.67  -- First 2 paid
            ELSE 0
        END,
        0,
        (CURRENT_DATE - INTERVAL '2 months' + (i || ' months')::INTERVAL)::DATE,
        CASE 
            WHEN i <= 2 THEN (CURRENT_DATE - INTERVAL '2 months' + (i || ' months')::INTERVAL)::DATE
            ELSE NULL
        END,
        CASE 
            WHEN i <= 2 THEN 'Paid'::installment_status
            WHEN i = 3 THEN 'Late'::installment_status  -- Overdue
            ELSE 'Unpaid'::installment_status
        END
    FROM generate_series(1, 18) i;
    
    -- Installments for Sale 6 (mohamed - 12 months, started 1 month ago)
    INSERT INTO installments (sale_id, installment_number, amount_due, amount_paid, stacked_amount, due_date, paid_date, status)
    SELECT 
        sale6_id,
        i,
        208.33,
        CASE 
            WHEN i = 1 THEN 208.33  -- First paid
            ELSE 0
        END,
        0,
        (CURRENT_DATE - INTERVAL '1 month' + (i || ' months')::INTERVAL)::DATE,
        CASE 
            WHEN i = 1 THEN (CURRENT_DATE - INTERVAL '1 month' + (1 || ' months')::INTERVAL)::DATE
            ELSE NULL
        END,
        CASE 
            WHEN i = 1 THEN 'Paid'::installment_status
            WHEN i = 2 THEN 'Late'::installment_status  -- Overdue
            ELSE 'Unpaid'::installment_status
        END
    FROM generate_series(1, 12) i;
    
    -- Installments for Sale 7 (abir - 12 months, started 1 month ago) - Many installments
    INSERT INTO installments (sale_id, installment_number, amount_due, amount_paid, stacked_amount, due_date, paid_date, status)
    SELECT 
        sale7_id,
        i,
        202.54,
        CASE 
            WHEN i = 1 THEN 69.50  -- Only small advance paid
            ELSE 0
        END,
        CASE 
            WHEN i = 1 THEN 133.04  -- Stacked
            ELSE 0
        END,
        (CURRENT_DATE - INTERVAL '1 month' + (i || ' months')::INTERVAL)::DATE,
        NULL,
        CASE 
            WHEN i = 1 THEN 'Partial'::installment_status
            WHEN i = 2 THEN 'Late'::installment_status  -- Overdue
            ELSE 'Unpaid'::installment_status
        END
    FROM generate_series(1, 12) i;
    
    -- =====================================================
    -- 7. PAYMENTS (Various payment types and dates)
    -- =====================================================
    
    -- Full payment for Sale 1
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client1_id, sale1_id, 8000.00, 'Full', CURRENT_DATE - INTERVAL '30 days', 'Cash', first_user_id);
    
    -- Small advance for Sale 2
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client1_id, sale2_id, 150.00, 'SmallAdvance', CURRENT_DATE - INTERVAL '2 days', 'Cash', first_user_id);
    
    -- Small advance + Big advance for Sale 3
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client2_id, sale3_id, 75.00, 'SmallAdvance', CURRENT_DATE - INTERVAL '3 months', 'Cash', first_user_id),
    (client2_id, sale3_id, 2075.00, 'BigAdvance', CURRENT_DATE - INTERVAL '3 months', 'Bank Transfer', first_user_id);
    
    -- Full payment for Sale 4
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client3_id, sale4_id, 4000.00, 'Full', CURRENT_DATE - INTERVAL '15 days', 'Cash', first_user_id);
    
    -- Big advance for Sale 5
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client3_id, sale5_id, 1500.00, 'BigAdvance', CURRENT_DATE - INTERVAL '2 months', 'Cash', first_user_id);
    
    -- Big advance for Sale 6
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client2_id, sale6_id, 2000.00, 'BigAdvance', CURRENT_DATE - INTERVAL '1 month', 'Bank Transfer', first_user_id);
    
    -- Small advance + Big advance for Sale 7
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client3_id, sale7_id, 69.50, 'SmallAdvance', CURRENT_DATE - INTERVAL '1 month', 'Cash', first_user_id),
    (client3_id, sale7_id, 2069.50, 'BigAdvance', CURRENT_DATE - INTERVAL '1 month', 'Cash', first_user_id);
    
    -- Full payments for Sales 8 and 9
    INSERT INTO payments (client_id, sale_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    VALUES
    (client2_id, sale8_id, 8000.00, 'Full', CURRENT_DATE - INTERVAL '20 days', 'Cash', first_user_id),
    (client2_id, sale9_id, 8000.00, 'Full', CURRENT_DATE - INTERVAL '25 days', 'Bank Transfer', first_user_id);
    
    -- Installment payments for Sale 3 (3 paid installments)
    INSERT INTO payments (client_id, sale_id, installment_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    SELECT 
        client2_id,
        sale3_id,
        i.id,
        202.08,
        'Installment',
        i.due_date,
        'Cash',
        first_user_id
    FROM installments i
    WHERE i.sale_id = sale3_id
    AND i.installment_number <= 3;
    
    -- Partial payment for Sale 3 installment 4
    INSERT INTO payments (client_id, sale_id, installment_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    SELECT 
        client2_id,
        sale3_id,
        i.id,
        100.00,
        'Installment',
        CURRENT_DATE - INTERVAL '5 days',
        'Cash',
        first_user_id
    FROM installments i
    WHERE i.sale_id = sale3_id
    AND i.installment_number = 4;
    
    -- Installment payments for Sale 5 (2 paid)
    INSERT INTO payments (client_id, sale_id, installment_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    SELECT 
        client3_id,
        sale5_id,
        i.id,
        166.67,
        'Installment',
        i.due_date,
        'Cash',
        first_user_id
    FROM installments i
    WHERE i.sale_id = sale5_id
    AND i.installment_number <= 2;
    
    -- Installment payment for Sale 6 (1 paid)
    INSERT INTO payments (client_id, sale_id, installment_id, amount_paid, payment_type, payment_date, payment_method, recorded_by)
    SELECT 
        client2_id,
        sale6_id,
        i.id,
        208.33,
        'Installment',
        i.due_date,
        'Cash',
        first_user_id
    FROM installments i
    WHERE i.sale_id = sale6_id
    AND i.installment_number = 1;
    
    -- =====================================================
    -- 8. UPDATE LAND PIECES STATUS BASED ON SALES
    -- =====================================================
    
    -- Update pieces in completed sales to 'Sold'
    UPDATE land_pieces
    SET status = 'Sold'
    WHERE id IN (
        SELECT UNNEST(land_piece_ids)
        FROM sales
        WHERE status = 'Completed'
    );
    
    -- Update pieces in pending/active sales to 'Sold' (they're sold but not completed)
    UPDATE land_pieces
    SET status = 'Sold'
    WHERE id IN (
        SELECT UNNEST(land_piece_ids)
        FROM sales
        WHERE status = 'Pending' AND is_confirmed = TRUE
    );
    
    RAISE NOTICE 'Test data created successfully!';
    RAISE NOTICE 'Land Batches: %', (SELECT COUNT(*) FROM land_batches);
    RAISE NOTICE 'Land Pieces: %', (SELECT COUNT(*) FROM land_pieces);
    RAISE NOTICE 'Clients: %', (SELECT COUNT(*) FROM clients);
    RAISE NOTICE 'Sales: %', (SELECT COUNT(*) FROM sales);
    RAISE NOTICE 'Installments: %', (SELECT COUNT(*) FROM installments);
    RAISE NOTICE 'Payments: %', (SELECT COUNT(*) FROM payments);
    RAISE NOTICE 'Reservations: %', (SELECT COUNT(*) FROM reservations);
    
END $$;

-- =====================================================
-- SUMMARY OF TEST DATA CREATED
-- =====================================================
-- 
-- LAND BATCHES: 3 batches
--   - tanyour: 50 pieces (P001-P050) - Real Estate Tax: 322552
--   - sidi bouzid: 30 pieces (P001-P030) - Real Estate Tax: 445123
--   - gafsa: 20 pieces (P001-P020) - Real Estate Tax: 556789
-- 
-- CLIENTS: 10 clients (mix of Individual and Company)
--   - haroun, mohamed saif allah elleuchi, abir, ahmed ben ali, fatima zahra
--   - شركة العقارات المتميزة (Company), youssef trabelsi, sara amara, khaled bouazizi, nour hammami
-- 
-- SALES: 10 sales covering:
--   - Full payment (Completed): 4 sales
--   - Installments (Pending - not confirmed): 2 sales
--   - Installments (Ongoing - confirmed): 4 sales
-- 
-- INSTALLMENTS: 
--   - Sale 3 (mohamed): 12 installments (3 paid, 1 partial, 4-6 overdue, rest unpaid)
--   - Sale 5 (abir): 18 installments (2 paid, 1 overdue, rest unpaid)
--   - Sale 6 (mohamed): 12 installments (1 paid, 1 overdue, rest unpaid)
--   - Sale 7 (abir): 12 installments (1 partial, 1 overdue, rest unpaid)
-- 
-- PAYMENTS: Various types
--   - Full payments
--   - SmallAdvance payments (عربون)
--   - BigAdvance payments (الدفعة الأولى)
--   - Installment payments
-- 
-- RESERVATIONS: 2 active reservations
-- 
-- =====================================================
-- TEST SCENARIOS COVERED:
-- =====================================================
-- ✓ Available land pieces
-- ✓ Reserved land pieces
-- ✓ Sold land pieces (completed sales)
-- ✓ Sold land pieces (ongoing installments)
-- ✓ Full payment sales (completed)
-- ✓ Installment sales (pending confirmation)
-- ✓ Installment sales (ongoing with payments)
-- ✓ Installments with various statuses (Paid, Unpaid, Late, Partial)
-- ✓ Overdue installments
-- ✓ Multiple payments per sale
-- ✓ Small advance (عربون) payments
-- ✓ Big advance (الدفعة الأولى) payments
-- ✓ Multiple sales per client
-- ✓ Different payment dates
-- ✓ Active reservations
-- =====================================================
