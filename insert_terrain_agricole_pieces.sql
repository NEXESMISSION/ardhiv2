-- ============================================
-- INSERT LAND PIECES FOR "Terrain agricole" BATCH
-- ============================================
-- This script inserts all land pieces for the "Terrain agricole" batch
-- Make sure the batch exists before running this script
-- ============================================

-- First, get the batch ID (replace with actual batch name if different)
DO $$
DECLARE
    batch_id UUID;
    current_piece_num INTEGER := 1;
BEGIN
    -- Get the batch ID for "Terrain agricole"
    SELECT id INTO batch_id 
    FROM land_batches 
    WHERE name = 'Terrain agricole' 
    LIMIT 1;
    
    IF batch_id IS NULL THEN
        RAISE EXCEPTION 'Batch "Terrain agricole" not found. Please create it first.';
    END IF;
    
    RAISE NOTICE 'Found batch ID: %', batch_id;
    RAISE NOTICE 'Starting to insert pieces...';
    
    -- Insert pieces 1-11 (explicitly numbered)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '1', 515, 0, 0, 0, 'Available'),
        (batch_id, '2', 410, 0, 0, 0, 'Available'),
        (batch_id, '3', 480, 0, 0, 0, 'Available'),
        (batch_id, '4', 500, 0, 0, 0, 'Available'),
        (batch_id, '5', 500, 0, 0, 0, 'Available'),
        (batch_id, '6', 517, 0, 0, 0, 'Available'),
        (batch_id, '7', 526, 0, 0, 0, 'Available'),
        (batch_id, '8', 525, 0, 0, 0, 'Available'),
        (batch_id, '9', 510, 0, 0, 0, 'Available'),
        (batch_id, '10', 593, 0, 0, 0, 'Available'),
        (batch_id, '11', 555, 0, 0, 0, 'Available');
    
    -- Pieces 12-27 (auto-numbered, just surfaces)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '12', 505, 0, 0, 0, 'Available'),
        (batch_id, '13', 530, 0, 0, 0, 'Available'),
        (batch_id, '14', 530, 0, 0, 0, 'Available'),
        (batch_id, '15', 510, 0, 0, 0, 'Available'),
        (batch_id, '16', 512, 0, 0, 0, 'Available'),
        (batch_id, '17', 451, 0, 0, 0, 'Available'),
        (batch_id, '18', 547, 0, 0, 0, 'Available'),
        (batch_id, '19', 510, 0, 0, 0, 'Available'),
        (batch_id, '20', 530, 0, 0, 0, 'Available'),
        (batch_id, '21', 530, 0, 0, 0, 'Available'),
        (batch_id, '22', 480, 0, 0, 0, 'Available'),
        (batch_id, '23', 725, 0, 0, 0, 'Available'),
        (batch_id, '24', 420, 0, 0, 0, 'Available'),
        (batch_id, '25', 420, 0, 0, 0, 'Available'),
        (batch_id, '26', 400, 0, 0, 0, 'Available'),
        (batch_id, '27', 400, 0, 0, 0, 'Available');
    
    -- Pieces 28-31 (range with surface 900)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '28', 900, 0, 0, 0, 'Available'),
        (batch_id, '29', 900, 0, 0, 0, 'Available'),
        (batch_id, '30', 900, 0, 0, 0, 'Available'),
        (batch_id, '31', 900, 0, 0, 0, 'Available');
    
    -- Piece 32
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '32', 525, 0, 0, 0, 'Available');
    
    -- Piece 33
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '33', 420, 0, 0, 0, 'Available');
    
    -- Pieces 34-38 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '34', 400, 0, 0, 0, 'Available'),
        (batch_id, '35', 400, 0, 0, 0, 'Available'),
        (batch_id, '36', 400, 0, 0, 0, 'Available'),
        (batch_id, '37', 400, 0, 0, 0, 'Available'),
        (batch_id, '38', 400, 0, 0, 0, 'Available');
    
    -- Piece 39
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '39', 405, 0, 0, 0, 'Available');
    
    -- Pieces 40-42 (auto-numbered, just surfaces)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '40', 400, 0, 0, 0, 'Available'),
        (batch_id, '41', 515, 0, 0, 0, 'Available'),
        (batch_id, '42', 655, 0, 0, 0, 'Available');
    
    -- Pieces 43-48 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '43', 400, 0, 0, 0, 'Available'),
        (batch_id, '44', 400, 0, 0, 0, 'Available'),
        (batch_id, '45', 400, 0, 0, 0, 'Available'),
        (batch_id, '46', 400, 0, 0, 0, 'Available'),
        (batch_id, '47', 400, 0, 0, 0, 'Available'),
        (batch_id, '48', 400, 0, 0, 0, 'Available');
    
    -- Pieces 49-54 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '49', 400, 0, 0, 0, 'Available'),
        (batch_id, '50', 400, 0, 0, 0, 'Available'),
        (batch_id, '51', 400, 0, 0, 0, 'Available'),
        (batch_id, '52', 400, 0, 0, 0, 'Available'),
        (batch_id, '53', 400, 0, 0, 0, 'Available'),
        (batch_id, '54', 400, 0, 0, 0, 'Available');
    
    -- Piece 55
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '55', 566, 0, 0, 0, 'Available');
    
    -- Piece 56
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '56', 456, 0, 0, 0, 'Available');
    
    -- Pieces 57-62 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '57', 400, 0, 0, 0, 'Available'),
        (batch_id, '58', 400, 0, 0, 0, 'Available'),
        (batch_id, '59', 400, 0, 0, 0, 'Available'),
        (batch_id, '60', 400, 0, 0, 0, 'Available'),
        (batch_id, '61', 400, 0, 0, 0, 'Available'),
        (batch_id, '62', 400, 0, 0, 0, 'Available');
    
    -- Pieces 63-66 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '63', 400, 0, 0, 0, 'Available'),
        (batch_id, '64', 400, 0, 0, 0, 'Available'),
        (batch_id, '65', 400, 0, 0, 0, 'Available'),
        (batch_id, '66', 400, 0, 0, 0, 'Available');
    
    -- Piece 67
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '67', 402, 0, 0, 0, 'Available');
    
    -- Piece 68
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '68', 641, 0, 0, 0, 'Available');
    
    -- Piece 69
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '69', 382, 0, 0, 0, 'Available');
    
    -- Pieces 70-78 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '70', 400, 0, 0, 0, 'Available'),
        (batch_id, '71', 400, 0, 0, 0, 'Available'),
        (batch_id, '72', 400, 0, 0, 0, 'Available'),
        (batch_id, '73', 400, 0, 0, 0, 'Available'),
        (batch_id, '74', 400, 0, 0, 0, 'Available'),
        (batch_id, '75', 400, 0, 0, 0, 'Available'),
        (batch_id, '76', 400, 0, 0, 0, 'Available'),
        (batch_id, '77', 400, 0, 0, 0, 'Available'),
        (batch_id, '78', 400, 0, 0, 0, 'Available');
    
    -- Piece 79
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '79', 313, 0, 0, 0, 'Available');
    
    -- Piece 80
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '80', 466, 0, 0, 0, 'Available');
    
    -- Pieces 81-86 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '81', 400, 0, 0, 0, 'Available'),
        (batch_id, '82', 400, 0, 0, 0, 'Available'),
        (batch_id, '83', 400, 0, 0, 0, 'Available'),
        (batch_id, '84', 400, 0, 0, 0, 'Available'),
        (batch_id, '85', 400, 0, 0, 0, 'Available'),
        (batch_id, '86', 400, 0, 0, 0, 'Available');
    
    -- Piece 87
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '87', 450, 0, 0, 0, 'Available');
    
    -- Piece 88
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '88', 512, 0, 0, 0, 'Available');
    
    -- Pieces 89-95 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '89', 400, 0, 0, 0, 'Available'),
        (batch_id, '90', 400, 0, 0, 0, 'Available'),
        (batch_id, '91', 400, 0, 0, 0, 'Available'),
        (batch_id, '92', 400, 0, 0, 0, 'Available'),
        (batch_id, '93', 400, 0, 0, 0, 'Available'),
        (batch_id, '94', 400, 0, 0, 0, 'Available'),
        (batch_id, '95', 400, 0, 0, 0, 'Available');
    
    -- Piece 96
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '96', 521, 0, 0, 0, 'Available');
    
    -- Pieces 97-102 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '97', 400, 0, 0, 0, 'Available'),
        (batch_id, '98', 400, 0, 0, 0, 'Available'),
        (batch_id, '99', 400, 0, 0, 0, 'Available'),
        (batch_id, '100', 400, 0, 0, 0, 'Available'),
        (batch_id, '101', 400, 0, 0, 0, 'Available'),
        (batch_id, '102', 400, 0, 0, 0, 'Available');
    
    -- Piece 103
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '103', 622, 0, 0, 0, 'Available');
    
    -- Piece 104
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '104', 500, 0, 0, 0, 'Available');
    
    -- Piece 105
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '105', 500, 0, 0, 0, 'Available');
    
    -- Piece 106
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '106', 622, 0, 0, 0, 'Available');
    
    -- Piece 107
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '107', 418, 0, 0, 0, 'Available');
    
    -- Pieces 108-109 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '108', 400, 0, 0, 0, 'Available'),
        (batch_id, '109', 400, 0, 0, 0, 'Available');
    
    -- Piece 110
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '110', 704, 0, 0, 0, 'Available');
    
    -- Piece 111
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '111', 450, 0, 0, 0, 'Available');
    
    -- Pieces 112-123 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '112', 400, 0, 0, 0, 'Available'),
        (batch_id, '113', 400, 0, 0, 0, 'Available'),
        (batch_id, '114', 400, 0, 0, 0, 'Available'),
        (batch_id, '115', 400, 0, 0, 0, 'Available'),
        (batch_id, '116', 400, 0, 0, 0, 'Available'),
        (batch_id, '117', 400, 0, 0, 0, 'Available'),
        (batch_id, '118', 400, 0, 0, 0, 'Available'),
        (batch_id, '119', 400, 0, 0, 0, 'Available'),
        (batch_id, '120', 400, 0, 0, 0, 'Available'),
        (batch_id, '121', 400, 0, 0, 0, 'Available'),
        (batch_id, '122', 400, 0, 0, 0, 'Available'),
        (batch_id, '123', 400, 0, 0, 0, 'Available');
    
    -- Piece 124
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '124', 450, 0, 0, 0, 'Available');
    
    -- Piece 125
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '125', 473, 0, 0, 0, 'Available');
    
    -- Piece 126
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '126', 601, 0, 0, 0, 'Available');
    
    -- Pieces 127-137 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '127', 400, 0, 0, 0, 'Available'),
        (batch_id, '128', 400, 0, 0, 0, 'Available'),
        (batch_id, '129', 400, 0, 0, 0, 'Available'),
        (batch_id, '130', 400, 0, 0, 0, 'Available'),
        (batch_id, '131', 400, 0, 0, 0, 'Available'),
        (batch_id, '132', 400, 0, 0, 0, 'Available'),
        (batch_id, '133', 400, 0, 0, 0, 'Available'),
        (batch_id, '134', 400, 0, 0, 0, 'Available'),
        (batch_id, '135', 400, 0, 0, 0, 'Available'),
        (batch_id, '136', 400, 0, 0, 0, 'Available'),
        (batch_id, '137', 400, 0, 0, 0, 'Available');
    
    -- Piece 138
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '138', 771, 0, 0, 0, 'Available');
    
    -- Piece 139
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '139', 448, 0, 0, 0, 'Available');
    
    -- Pieces 140-148 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '140', 400, 0, 0, 0, 'Available'),
        (batch_id, '141', 400, 0, 0, 0, 'Available'),
        (batch_id, '142', 400, 0, 0, 0, 'Available'),
        (batch_id, '143', 400, 0, 0, 0, 'Available'),
        (batch_id, '144', 400, 0, 0, 0, 'Available'),
        (batch_id, '145', 400, 0, 0, 0, 'Available'),
        (batch_id, '146', 400, 0, 0, 0, 'Available'),
        (batch_id, '147', 400, 0, 0, 0, 'Available'),
        (batch_id, '148', 400, 0, 0, 0, 'Available');
    
    -- Piece 149
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '149', 664, 0, 0, 0, 'Available');
    
    -- Piece 150
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '150', 656, 0, 0, 0, 'Available');
    
    -- Pieces 151-164 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '151', 400, 0, 0, 0, 'Available'),
        (batch_id, '152', 400, 0, 0, 0, 'Available'),
        (batch_id, '153', 400, 0, 0, 0, 'Available'),
        (batch_id, '154', 400, 0, 0, 0, 'Available'),
        (batch_id, '155', 400, 0, 0, 0, 'Available'),
        (batch_id, '156', 400, 0, 0, 0, 'Available'),
        (batch_id, '157', 400, 0, 0, 0, 'Available'),
        (batch_id, '158', 400, 0, 0, 0, 'Available'),
        (batch_id, '159', 400, 0, 0, 0, 'Available'),
        (batch_id, '160', 400, 0, 0, 0, 'Available'),
        (batch_id, '161', 400, 0, 0, 0, 'Available'),
        (batch_id, '162', 400, 0, 0, 0, 'Available'),
        (batch_id, '163', 400, 0, 0, 0, 'Available'),
        (batch_id, '164', 400, 0, 0, 0, 'Available');
    
    -- Piece 165
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '165', 549, 0, 0, 0, 'Available');
    
    -- Piece 166
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '166', 773, 0, 0, 0, 'Available');
    
    -- Pieces 167-178 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '167', 400, 0, 0, 0, 'Available'),
        (batch_id, '168', 400, 0, 0, 0, 'Available'),
        (batch_id, '169', 400, 0, 0, 0, 'Available'),
        (batch_id, '170', 400, 0, 0, 0, 'Available'),
        (batch_id, '171', 400, 0, 0, 0, 'Available'),
        (batch_id, '172', 400, 0, 0, 0, 'Available'),
        (batch_id, '173', 400, 0, 0, 0, 'Available'),
        (batch_id, '174', 400, 0, 0, 0, 'Available'),
        (batch_id, '175', 400, 0, 0, 0, 'Available'),
        (batch_id, '176', 400, 0, 0, 0, 'Available'),
        (batch_id, '177', 400, 0, 0, 0, 'Available'),
        (batch_id, '178', 400, 0, 0, 0, 'Available');
    
    -- Piece 179
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '179', 647, 0, 0, 0, 'Available');
    
    -- Piece 180
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '180', 467, 0, 0, 0, 'Available');
    
    -- Pieces 181-191 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '181', 400, 0, 0, 0, 'Available'),
        (batch_id, '182', 400, 0, 0, 0, 'Available'),
        (batch_id, '183', 400, 0, 0, 0, 'Available'),
        (batch_id, '184', 400, 0, 0, 0, 'Available'),
        (batch_id, '185', 400, 0, 0, 0, 'Available'),
        (batch_id, '186', 400, 0, 0, 0, 'Available'),
        (batch_id, '187', 400, 0, 0, 0, 'Available'),
        (batch_id, '188', 400, 0, 0, 0, 'Available'),
        (batch_id, '189', 400, 0, 0, 0, 'Available'),
        (batch_id, '190', 400, 0, 0, 0, 'Available'),
        (batch_id, '191', 400, 0, 0, 0, 'Available');
    
    -- Piece 192
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '192', 748, 0, 0, 0, 'Available');
    
    -- Piece 193
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '193', 701, 0, 0, 0, 'Available');
    
    -- Piece 194
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '194', 598, 0, 0, 0, 'Available');
    
    -- Piece 195
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '195', 561, 0, 0, 0, 'Available');
    
    -- Piece 196
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '196', 500, 0, 0, 0, 'Available');
    
    -- Pieces 197-198 (range with surface 500)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '197', 500, 0, 0, 0, 'Available'),
        (batch_id, '198', 500, 0, 0, 0, 'Available');
    
    -- Piece 199
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '199', 600, 0, 0, 0, 'Available');
    
    -- Piece 200
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '200', 600, 0, 0, 0, 'Available');
    
    -- Piece 201
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '201', 750, 0, 0, 0, 'Available');
    
    -- Piece 202
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '202', 750, 0, 0, 0, 'Available');
    
    -- Piece 203
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '203', 800, 0, 0, 0, 'Available');
    
    -- Piece 204
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '204', 800, 0, 0, 0, 'Available');
    
    -- Piece 205
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '205', 450, 0, 0, 0, 'Available');
    
    -- Piece 206
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '206', 451, 0, 0, 0, 'Available');
    
    -- Piece 207
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '207', 448, 0, 0, 0, 'Available');
    
    -- Piece 208
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '208', 444, 0, 0, 0, 'Available');
    
    -- Piece 209
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '209', 450, 0, 0, 0, 'Available');
    
    -- Piece 210
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '210', 450, 0, 0, 0, 'Available');
    
    -- Pieces 211-213 (range with surface 470)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '211', 470, 0, 0, 0, 'Available'),
        (batch_id, '212', 470, 0, 0, 0, 'Available'),
        (batch_id, '213', 470, 0, 0, 0, 'Available');
    
    -- Piece 214
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '214', 585, 0, 0, 0, 'Available');
    
    -- Pieces 215-230 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '215', 400, 0, 0, 0, 'Available'),
        (batch_id, '216', 400, 0, 0, 0, 'Available'),
        (batch_id, '217', 400, 0, 0, 0, 'Available'),
        (batch_id, '218', 400, 0, 0, 0, 'Available'),
        (batch_id, '219', 400, 0, 0, 0, 'Available'),
        (batch_id, '220', 400, 0, 0, 0, 'Available'),
        (batch_id, '221', 400, 0, 0, 0, 'Available'),
        (batch_id, '222', 400, 0, 0, 0, 'Available'),
        (batch_id, '223', 400, 0, 0, 0, 'Available'),
        (batch_id, '224', 400, 0, 0, 0, 'Available'),
        (batch_id, '225', 400, 0, 0, 0, 'Available'),
        (batch_id, '226', 400, 0, 0, 0, 'Available'),
        (batch_id, '227', 400, 0, 0, 0, 'Available'),
        (batch_id, '228', 400, 0, 0, 0, 'Available'),
        (batch_id, '229', 400, 0, 0, 0, 'Available'),
        (batch_id, '230', 400, 0, 0, 0, 'Available');
    
    -- Piece 231
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '231', 634, 0, 0, 0, 'Available');
    
    -- Pieces 232-234 (range with surface 470)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '232', 470, 0, 0, 0, 'Available'),
        (batch_id, '233', 470, 0, 0, 0, 'Available'),
        (batch_id, '234', 470, 0, 0, 0, 'Available');
    
    -- Piece 235
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '235', 703, 0, 0, 0, 'Available');
    
    -- Pieces 236-251 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '236', 400, 0, 0, 0, 'Available'),
        (batch_id, '237', 400, 0, 0, 0, 'Available'),
        (batch_id, '238', 400, 0, 0, 0, 'Available'),
        (batch_id, '239', 400, 0, 0, 0, 'Available'),
        (batch_id, '240', 400, 0, 0, 0, 'Available'),
        (batch_id, '241', 400, 0, 0, 0, 'Available'),
        (batch_id, '242', 400, 0, 0, 0, 'Available'),
        (batch_id, '243', 400, 0, 0, 0, 'Available'),
        (batch_id, '244', 400, 0, 0, 0, 'Available'),
        (batch_id, '245', 400, 0, 0, 0, 'Available'),
        (batch_id, '246', 400, 0, 0, 0, 'Available'),
        (batch_id, '247', 400, 0, 0, 0, 'Available'),
        (batch_id, '248', 400, 0, 0, 0, 'Available'),
        (batch_id, '249', 400, 0, 0, 0, 'Available'),
        (batch_id, '250', 400, 0, 0, 0, 'Available'),
        (batch_id, '251', 400, 0, 0, 0, 'Available');
    
    -- Piece 252
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '252', 753, 0, 0, 0, 'Available');
    
    -- Pieces 253-256 (range with surface 470)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '253', 470, 0, 0, 0, 'Available'),
        (batch_id, '254', 470, 0, 0, 0, 'Available'),
        (batch_id, '255', 470, 0, 0, 0, 'Available'),
        (batch_id, '256', 470, 0, 0, 0, 'Available');
    
    -- Piece 257
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '257', 492, 0, 0, 0, 'Available');
    
    -- Piece 258
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '258', 605, 0, 0, 0, 'Available');
    
    -- Piece 259
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '259', 600, 0, 0, 0, 'Available');
    
    -- Piece 260
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '260', 700, 0, 0, 0, 'Available');
    
    -- Piece 261
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '261', 600, 0, 0, 0, 'Available');
    
    -- Piece 262
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '262', 502, 0, 0, 0, 'Available');
    
    -- Piece 263
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '263', 351, 0, 0, 0, 'Available');
    
    -- Piece 264
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '264', 703, 0, 0, 0, 'Available');
    
    -- Pieces 265-267 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '265', 400, 0, 0, 0, 'Available'),
        (batch_id, '266', 400, 0, 0, 0, 'Available'),
        (batch_id, '267', 400, 0, 0, 0, 'Available');
    
    -- Piece 268
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '268', 698, 0, 0, 0, 'Available');
    
    -- Piece 269
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '269', 318, 0, 0, 0, 'Available');
    
    -- Pieces 270-273 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '270', 400, 0, 0, 0, 'Available'),
        (batch_id, '271', 400, 0, 0, 0, 'Available'),
        (batch_id, '272', 400, 0, 0, 0, 'Available'),
        (batch_id, '273', 400, 0, 0, 0, 'Available');
    
    -- Piece 274
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '274', 629, 0, 0, 0, 'Available');
    
    -- Piece 275
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '275', 500, 0, 0, 0, 'Available');
    
    -- Pieces 276-284 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '276', 400, 0, 0, 0, 'Available'),
        (batch_id, '277', 400, 0, 0, 0, 'Available'),
        (batch_id, '278', 400, 0, 0, 0, 'Available'),
        (batch_id, '279', 400, 0, 0, 0, 'Available'),
        (batch_id, '280', 400, 0, 0, 0, 'Available'),
        (batch_id, '281', 400, 0, 0, 0, 'Available'),
        (batch_id, '282', 400, 0, 0, 0, 'Available'),
        (batch_id, '283', 400, 0, 0, 0, 'Available'),
        (batch_id, '284', 400, 0, 0, 0, 'Available');
    
    -- Piece 285
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '285', 461, 0, 0, 0, 'Available');
    
    -- Piece 286
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '286', 412, 0, 0, 0, 'Available');
    
    -- Pieces 287-298 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '287', 400, 0, 0, 0, 'Available'),
        (batch_id, '288', 400, 0, 0, 0, 'Available'),
        (batch_id, '289', 400, 0, 0, 0, 'Available'),
        (batch_id, '290', 400, 0, 0, 0, 'Available'),
        (batch_id, '291', 400, 0, 0, 0, 'Available'),
        (batch_id, '292', 400, 0, 0, 0, 'Available'),
        (batch_id, '293', 400, 0, 0, 0, 'Available'),
        (batch_id, '294', 400, 0, 0, 0, 'Available'),
        (batch_id, '295', 400, 0, 0, 0, 'Available'),
        (batch_id, '296', 400, 0, 0, 0, 'Available'),
        (batch_id, '297', 400, 0, 0, 0, 'Available'),
        (batch_id, '298', 400, 0, 0, 0, 'Available');
    
    -- Piece 299
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '299', 717, 0, 0, 0, 'Available');
    
    -- Piece 300
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '300', 536, 0, 0, 0, 'Available');
    
    -- Piece 301
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '301', 659, 0, 0, 0, 'Available');
    
    -- Piece 302
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '302', 456, 0, 0, 0, 'Available');
    
    -- Pieces 303-306 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '303', 400, 0, 0, 0, 'Available'),
        (batch_id, '304', 400, 0, 0, 0, 'Available'),
        (batch_id, '305', 400, 0, 0, 0, 'Available'),
        (batch_id, '306', 400, 0, 0, 0, 'Available');
    
    -- Piece 307
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '307', 687, 0, 0, 0, 'Available');
    
    -- Piece 308
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '308', 343, 0, 0, 0, 'Available');
    
    -- Pieces 309-312 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '309', 400, 0, 0, 0, 'Available'),
        (batch_id, '310', 400, 0, 0, 0, 'Available'),
        (batch_id, '311', 400, 0, 0, 0, 'Available'),
        (batch_id, '312', 400, 0, 0, 0, 'Available');
    
    -- Piece 313
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '313', 492, 0, 0, 0, 'Available');
    
    -- Piece 314
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '314', 649, 0, 0, 0, 'Available');
    
    -- Pieces 315-321 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '315', 400, 0, 0, 0, 'Available'),
        (batch_id, '316', 400, 0, 0, 0, 'Available'),
        (batch_id, '317', 400, 0, 0, 0, 'Available'),
        (batch_id, '318', 400, 0, 0, 0, 'Available'),
        (batch_id, '319', 400, 0, 0, 0, 'Available'),
        (batch_id, '320', 400, 0, 0, 0, 'Available'),
        (batch_id, '321', 400, 0, 0, 0, 'Available');
    
    -- Piece 322
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '322', 422, 0, 0, 0, 'Available');
    
    -- Piece 323
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '323', 690, 0, 0, 0, 'Available');
    
    -- Pieces 324-332 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '324', 400, 0, 0, 0, 'Available'),
        (batch_id, '325', 400, 0, 0, 0, 'Available'),
        (batch_id, '326', 400, 0, 0, 0, 'Available'),
        (batch_id, '327', 400, 0, 0, 0, 'Available'),
        (batch_id, '328', 400, 0, 0, 0, 'Available'),
        (batch_id, '329', 400, 0, 0, 0, 'Available'),
        (batch_id, '330', 400, 0, 0, 0, 'Available'),
        (batch_id, '331', 400, 0, 0, 0, 'Available'),
        (batch_id, '332', 400, 0, 0, 0, 'Available');
    
    -- Piece 333
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '333', 642, 0, 0, 0, 'Available');
    
    -- Piece 334
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '334', 395, 0, 0, 0, 'Available');
    
    -- Pieces 335-349 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '335', 400, 0, 0, 0, 'Available'),
        (batch_id, '336', 400, 0, 0, 0, 'Available'),
        (batch_id, '337', 400, 0, 0, 0, 'Available'),
        (batch_id, '338', 400, 0, 0, 0, 'Available'),
        (batch_id, '339', 400, 0, 0, 0, 'Available'),
        (batch_id, '340', 400, 0, 0, 0, 'Available'),
        (batch_id, '341', 400, 0, 0, 0, 'Available'),
        (batch_id, '342', 400, 0, 0, 0, 'Available'),
        (batch_id, '343', 400, 0, 0, 0, 'Available'),
        (batch_id, '344', 400, 0, 0, 0, 'Available'),
        (batch_id, '345', 400, 0, 0, 0, 'Available'),
        (batch_id, '346', 400, 0, 0, 0, 'Available'),
        (batch_id, '347', 400, 0, 0, 0, 'Available'),
        (batch_id, '348', 400, 0, 0, 0, 'Available'),
        (batch_id, '349', 400, 0, 0, 0, 'Available');
    
    -- Piece 350
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '350', 415, 0, 0, 0, 'Available');
    
    -- Piece 351
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '351', 366, 0, 0, 0, 'Available');
    
    -- Pieces 352-361 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '352', 400, 0, 0, 0, 'Available'),
        (batch_id, '353', 400, 0, 0, 0, 'Available'),
        (batch_id, '354', 400, 0, 0, 0, 'Available'),
        (batch_id, '355', 400, 0, 0, 0, 'Available'),
        (batch_id, '356', 400, 0, 0, 0, 'Available'),
        (batch_id, '357', 400, 0, 0, 0, 'Available'),
        (batch_id, '358', 400, 0, 0, 0, 'Available'),
        (batch_id, '359', 400, 0, 0, 0, 'Available'),
        (batch_id, '360', 400, 0, 0, 0, 'Available'),
        (batch_id, '361', 400, 0, 0, 0, 'Available');
    
    -- Piece 362
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '362', 574, 0, 0, 0, 'Available');
    
    -- Piece 363
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '363', 645, 0, 0, 0, 'Available');
    
    -- Pieces 364-373 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '364', 400, 0, 0, 0, 'Available'),
        (batch_id, '365', 400, 0, 0, 0, 'Available'),
        (batch_id, '366', 400, 0, 0, 0, 'Available'),
        (batch_id, '367', 400, 0, 0, 0, 'Available'),
        (batch_id, '368', 400, 0, 0, 0, 'Available'),
        (batch_id, '369', 400, 0, 0, 0, 'Available'),
        (batch_id, '370', 400, 0, 0, 0, 'Available'),
        (batch_id, '371', 400, 0, 0, 0, 'Available'),
        (batch_id, '372', 400, 0, 0, 0, 'Available'),
        (batch_id, '373', 400, 0, 0, 0, 'Available');
    
    -- Piece 374
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '374', 695, 0, 0, 0, 'Available');
    
    -- Piece 375
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '375', 535, 0, 0, 0, 'Available');
    
    -- Piece 376
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '376', 460, 0, 0, 0, 'Available');
    
    -- Piece 377
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '377', 510, 0, 0, 0, 'Available');
    
    -- Piece 378
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '378', 565, 0, 0, 0, 'Available');
    
    -- Piece 379
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '379', 630, 0, 0, 0, 'Available');
    
    -- Piece 380
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '380', 685, 0, 0, 0, 'Available');
    
    -- Piece 381
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '381', 400, 0, 0, 0, 'Available');
    
    -- Piece 382
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '382', 530, 0, 0, 0, 'Available');
    
    -- Piece 383
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '383', 400, 0, 0, 0, 'Available');
    
    -- Piece 384
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '384', 755, 0, 0, 0, 'Available');
    
    -- Piece 385
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '385', 445, 0, 0, 0, 'Available');
    
    -- Piece 386
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '386', 510, 0, 0, 0, 'Available');
    
    -- Piece 387
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '387', 420, 0, 0, 0, 'Available');
    
    -- Piece 388
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '388', 450, 0, 0, 0, 'Available');
    
    -- Piece 389
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '389', 495, 0, 0, 0, 'Available');
    
    -- Piece 390
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '390', 600, 0, 0, 0, 'Available');
    
    -- Piece 391
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '391', 590, 0, 0, 0, 'Available');
    
    -- Piece 392
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '392', 445, 0, 0, 0, 'Available');
    
    -- Piece 393
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '393', 445, 0, 0, 0, 'Available');
    
    -- Piece 394
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '394', 900, 0, 0, 0, 'Available');
    
    -- Pieces 395-398 (range with surface 420)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '395', 420, 0, 0, 0, 'Available'),
        (batch_id, '396', 420, 0, 0, 0, 'Available'),
        (batch_id, '397', 420, 0, 0, 0, 'Available'),
        (batch_id, '398', 420, 0, 0, 0, 'Available');
    
    -- Piece 399
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '399', 490, 0, 0, 0, 'Available');
    
    -- Pieces 400-403 (range with surface 420)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '400', 420, 0, 0, 0, 'Available'),
        (batch_id, '401', 420, 0, 0, 0, 'Available'),
        (batch_id, '402', 420, 0, 0, 0, 'Available'),
        (batch_id, '403', 420, 0, 0, 0, 'Available');
    
    -- Pieces 404-407 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '404', 400, 0, 0, 0, 'Available'),
        (batch_id, '405', 400, 0, 0, 0, 'Available'),
        (batch_id, '406', 400, 0, 0, 0, 'Available'),
        (batch_id, '407', 400, 0, 0, 0, 'Available');
    
    -- Piece 408
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '408', 470, 0, 0, 0, 'Available');
    
    -- Piece 409
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '409', 500, 0, 0, 0, 'Available');
    
    -- Piece 410
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '410', 500, 0, 0, 0, 'Available');
    
    -- Piece 411
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '411', 515, 0, 0, 0, 'Available');
    
    -- Piece 412
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '412', 450, 0, 0, 0, 'Available');
    
    -- Piece 413
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '413', 450, 0, 0, 0, 'Available');
    
    -- Piece 414
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '414', 500, 0, 0, 0, 'Available');
    
    -- Piece 415
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '415', 427, 0, 0, 0, 'Available');
    
    -- Pieces 416-418 (range with surface 400)
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES
        (batch_id, '416', 400, 0, 0, 0, 'Available'),
        (batch_id, '417', 400, 0, 0, 0, 'Available'),
        (batch_id, '418', 400, 0, 0, 0, 'Available');
    
    -- Piece 419
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '419', 575, 0, 0, 0, 'Available');
    
    -- Piece 420
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '420', 400, 0, 0, 0, 'Available');
    
    -- Piece 421
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '421', 755, 0, 0, 0, 'Available');
    
    -- Piece 422
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '422', 519, 0, 0, 0, 'Available');
    
    -- Piece 423
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '423', 590, 0, 0, 0, 'Available');
    
    -- Piece 424
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '424', 680, 0, 0, 0, 'Available');
    
    -- Piece 425
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '425', 750, 0, 0, 0, 'Available');
    
    -- Piece 426
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '426', 605, 0, 0, 0, 'Available');
    
    -- Piece 427
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '427', 535, 0, 0, 0, 'Available');
    
    -- Piece 428
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '428', 500, 0, 0, 0, 'Available');
    
    -- Piece 429
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '429', 540, 0, 0, 0, 'Available');
    
    -- Piece 430
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '430', 640, 0, 0, 0, 'Available');
    
    -- Piece 431
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '431', 645, 0, 0, 0, 'Available');
    
    -- Piece 432
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '432', 415, 0, 0, 0, 'Available');
    
    -- Piece 433
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '433', 420, 0, 0, 0, 'Available');
    
    -- Piece 434
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '434', 547, 0, 0, 0, 'Available');
    
    -- Piece 435
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '435', 400, 0, 0, 0, 'Available');
    
    -- Piece 436
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '436', 620, 0, 0, 0, 'Available');
    
    -- Piece 437
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '437', 615, 0, 0, 0, 'Available');
    
    -- Piece 438
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '438', 400, 0, 0, 0, 'Available');
    
    -- Piece 439
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '439', 464, 0, 0, 0, 'Available');
    
    -- Piece 440
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '440', 463, 0, 0, 0, 'Available');
    
    -- Piece 441
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '441', 400, 0, 0, 0, 'Available');
    
    -- Piece 442
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '442', 400, 0, 0, 0, 'Available');
    
    -- Piece 443
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '443', 455, 0, 0, 0, 'Available');
    
    -- Piece 444
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '444', 608, 0, 0, 0, 'Available');
    
    -- Piece 445
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '445', 535, 0, 0, 0, 'Available');
    
    -- Piece 446
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '446', 400, 0, 0, 0, 'Available');
    
    -- Piece 447
    INSERT INTO land_pieces (land_batch_id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status)
    VALUES (batch_id, '447', 445, 0, 0, 0, 'Available');
    
    RAISE NOTICE 'Successfully inserted all pieces for batch "Terrain agricole"';
    RAISE NOTICE 'Total pieces inserted: 447';
    
END $$;

-- Verify the insertion
SELECT 
    COUNT(*) as total_pieces,
    SUM(surface_area) as total_surface,
    MIN(CAST(piece_number AS INTEGER)) as min_piece,
    MAX(CAST(piece_number AS INTEGER)) as max_piece
FROM land_pieces 
WHERE land_batch_id = (SELECT id FROM land_batches WHERE name = 'Terrain agricole' LIMIT 1);

