// ============================================================================
// LAND PAGE - Clean & Simple Batch Management
// ============================================================================
// This page manages land batches with:
// - Create/Edit batches (basic info, full payment, installment offers)
// - View pieces for each batch
// - Delete batches
// ============================================================================

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { Dialog } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ============================================================================
// TYPES
// ============================================================================

type AdvanceMode = 'fixed' | 'percent'
type InstallmentCalcMode = 'monthlyAmount' | 'months'

interface FullPaymentConfig {
  pricePerM2: number
  companyFeePercent: number
}

interface InstallmentOffer {
  id: string
  name: string
  pricePerM2: number
  companyFeePercent: number
  advanceMode: AdvanceMode
  advanceValue: number
  calcMode: InstallmentCalcMode
  monthlyAmount?: number
  months?: number
}

interface LandBatch {
  id: string
  name: string
  location: string | null
  title_reference: string | null
  price_per_m2_cash: number | null
  company_fee_percent_cash: number | null
  created_at: string
  updated_at: string
}

interface LandPiece {
  id: string
  batch_id: string
  piece_number: string
  surface_m2: number
  notes: string | null
  direct_full_payment_price: number | null
  status: string
  created_at: string
  updated_at: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LandPage() {
  // ============================================================================
  // STATE: Batches List
  // ============================================================================
  const [batches, setBatches] = useState<LandBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  // ============================================================================
  // STATE: Dialogs
  // ============================================================================
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [piecesDialogOpen, setPiecesDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // ============================================================================
  // STATE: Selected Batch
  // ============================================================================
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [selectedBatchName, setSelectedBatchName] = useState<string>('')
  const [batchPieces, setBatchPieces] = useState<LandPiece[]>([])
  const [loadingPieces, setLoadingPieces] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null)

  // ============================================================================
  // STATE: Form Data
  // ============================================================================
  const [batchName, setBatchName] = useState('')
  const [location, setLocation] = useState('')
  const [titleReference, setTitleReference] = useState('')
  const [fullPayment, setFullPayment] = useState<FullPaymentConfig>({
    pricePerM2: 0,
    companyFeePercent: 0,
  })
  const [installmentOffers, setInstallmentOffers] = useState<InstallmentOffer[]>([])
  const [newOffer, setNewOffer] = useState<InstallmentOffer>({
    id: 'new',
    name: '',
    pricePerM2: 0,
    companyFeePercent: 0,
    advanceMode: 'fixed',
    advanceValue: 0,
    calcMode: 'monthlyAmount',
    monthlyAmount: undefined,
    months: undefined,
  })

  // ============================================================================
  // STATE: Form Status
  // ============================================================================
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // ============================================================================
  // EFFECTS
  // ============================================================================
  useEffect(() => {
    loadBatches()
  }, [])

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  async function loadBatches() {
    setLoading(true)
    setListError(null)
    try {
      const { data, error: err } = await supabase
        .from('land_batches')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err
      setBatches(data || [])
    } catch (e: any) {
      setListError(e.message || 'Échec du chargement des lots')
    } finally {
      setLoading(false)
    }
  }

  async function loadPieces(batchId: string) {
    setLoadingPieces(true)
    try {
      const { data, error } = await supabase
        .from('land_pieces')
        .select('*')
        .eq('batch_id', batchId)
        .order('piece_number', { ascending: true })

      if (error) throw error
      setBatchPieces(data || [])
    } catch (e: any) {
      console.error('Error loading pieces:', e)
      setBatchPieces([])
    } finally {
      setLoadingPieces(false)
    }
  }

  // ============================================================================
  // DIALOG HANDLERS
  // ============================================================================

  function openCreateDialog() {
    resetForm()
    setEditingBatchId(null)
    setBatchDialogOpen(true)
  }

  async function openEditDialog(batchId: string) {
    const batch = batches.find((b) => b.id === batchId)
    if (!batch) return

    setEditingBatchId(batchId)
    setBatchName(batch.name)
    setLocation(batch.location || '')
    setTitleReference(batch.title_reference || '')
    setFullPayment({
      pricePerM2: batch.price_per_m2_cash || 0,
      companyFeePercent: batch.company_fee_percent_cash || 0,
    })

    // Load offers
    try {
      const { data: offers } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('batch_id', batchId)
        .is('land_piece_id', null)

      if (offers) {
        setInstallmentOffers(
          offers.map((o: any) => ({
            id: o.id,
            name: o.name || '',
            pricePerM2: o.price_per_m2_installment || 0,
            companyFeePercent: o.company_fee_percent || 0,
            advanceMode: o.advance_mode as AdvanceMode,
            advanceValue: o.advance_value || 0,
            calcMode: o.calc_mode as InstallmentCalcMode,
            monthlyAmount: o.monthly_amount || undefined,
            months: o.months || undefined,
          })),
        )
      }
    } catch (e) {
      console.error('Error loading offers:', e)
    }

    setBatchDialogOpen(true)
  }

  async function openPiecesDialog(batchId: string) {
    const batch = batches.find((b) => b.id === batchId)
    if (!batch) return

    setSelectedBatchId(batchId)
    setSelectedBatchName(batch.name)
    setPiecesDialogOpen(true)
    await loadPieces(batchId)
  }

  // ============================================================================
  // FORM HELPERS
  // ============================================================================

  function resetForm() {
    setBatchName('')
    setLocation('')
    setTitleReference('')
    setFullPayment({ pricePerM2: 0, companyFeePercent: 0 })
    setInstallmentOffers([])
    setNewOffer({
      id: 'new',
      name: '',
      pricePerM2: 0,
      companyFeePercent: 0,
      advanceMode: 'fixed',
      advanceValue: 0,
      calcMode: 'monthlyAmount',
      monthlyAmount: undefined,
      months: undefined,
    })
    setError(null)
    setSuccess(null)
  }

  function addInstallmentOffer() {
    if (!newOffer.pricePerM2) return

    setInstallmentOffers((prev) => [
      ...prev,
      {
        ...newOffer,
        id: `${Date.now()}-${prev.length}`,
      },
    ])

    setNewOffer({
      id: 'new',
      name: '',
      pricePerM2: 0,
      companyFeePercent: 0,
      advanceMode: 'fixed',
      advanceValue: 0,
      calcMode: 'monthlyAmount',
      monthlyAmount: undefined,
      months: undefined,
    })
  }

  // ============================================================================
  // SAVE/UPDATE BATCH
  // ============================================================================

  async function handleSaveBatch() {
    setError(null)
    setSuccess(null)

    if (!batchName.trim()) {
      setError('Le nom du terrain est obligatoire')
      return
    }

    setSaving(true)
    try {
      if (editingBatchId) {
        // UPDATE EXISTING BATCH
        const { error: batchError } = await supabase
          .from('land_batches')
          .update({
            name: batchName.trim(),
            location: location.trim() || null,
            title_reference: titleReference.trim() || null,
            price_per_m2_cash: fullPayment.pricePerM2 || null,
            company_fee_percent_cash: fullPayment.companyFeePercent || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingBatchId)

        if (batchError) throw batchError

        // Delete old offers and insert new ones
        await supabase
          .from('payment_offers')
          .delete()
          .eq('batch_id', editingBatchId)
          .is('land_piece_id', null)

        const offersPayload = installmentOffers.map((offer) => ({
          batch_id: editingBatchId,
          name: offer.name || null,
          price_per_m2_installment: offer.pricePerM2 || null,
          company_fee_percent: offer.companyFeePercent || null,
          advance_mode: offer.advanceMode,
          advance_value: offer.advanceValue || 0,
          calc_mode: offer.calcMode,
          monthly_amount: offer.calcMode === 'monthlyAmount' ? offer.monthlyAmount || null : null,
          months: offer.calcMode === 'months' ? offer.months || null : null,
        }))

        if (offersPayload.length > 0) {
          const { error: offersError } = await supabase.from('payment_offers').insert(offersPayload)
          if (offersError) throw offersError
        }

        setSuccess('Lot mis à jour avec succès')
      } else {
        // CREATE NEW BATCH
        const { data: batch, error: batchError } = await supabase
          .from('land_batches')
          .insert({
            name: batchName.trim(),
            location: location.trim() || null,
            title_reference: titleReference.trim() || null,
            price_per_m2_cash: fullPayment.pricePerM2 || null,
            company_fee_percent_cash: fullPayment.companyFeePercent || null,
          })
          .select('id')
          .single()

        if (batchError) throw batchError

        if (!batch) {
          throw new Error('Échec de la création du lot')
        }

        const offersPayload = installmentOffers.map((offer) => ({
          batch_id: batch.id,
          name: offer.name || null,
          price_per_m2_installment: offer.pricePerM2 || null,
          company_fee_percent: offer.companyFeePercent || null,
          advance_mode: offer.advanceMode,
          advance_value: offer.advanceValue || 0,
          calc_mode: offer.calcMode,
          monthly_amount: offer.calcMode === 'monthlyAmount' ? offer.monthlyAmount || null : null,
          months: offer.calcMode === 'months' ? offer.months || null : null,
        }))

        if (offersPayload.length > 0) {
          const { error: offersError } = await supabase.from('payment_offers').insert(offersPayload)
          if (offersError) throw offersError
        }

        setSuccess('Lot créé avec succès')
      }

      setTimeout(() => {
        setBatchDialogOpen(false)
        loadBatches()
        resetForm()
      }, 1500)
    } catch (e: any) {
      setError(e.message || 'Erreur inattendue')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // DELETE BATCH
  // ============================================================================

  async function handleDeleteBatch() {
    if (!batchToDelete) return

    setDeleting(true)
    try {
      const { error } = await supabase.from('land_batches').delete().eq('id', batchToDelete)

      if (error) throw error

      setDeleteConfirmOpen(false)
      setBatchToDelete(null)
      await loadBatches()
    } catch (e: any) {
      setError(e.message || 'Échec de la suppression du lot')
    } finally {
      setDeleting(false)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Lots de terrains</h1>
            <p className="text-sm text-gray-600 mt-1">Gestion des lots de terrains, parcelles et offres</p>
          </div>
          <Button onClick={openCreateDialog} size="md">
            + Nouveau lot
          </Button>
        </header>

        {/* Error Alert */}
        {listError && (
          <div className="mb-4">
            <Alert variant="error">{listError}</Alert>
          </div>
        )}

        {/* Batches List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">Chargement...</p>
          </div>
        ) : batches.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-gray-500 mb-4">Aucun lot pour le moment</p>
              <Button onClick={openCreateDialog}>Créer un nouveau lot</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map((batch) => (
              <Card
                key={batch.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openPiecesDialog(batch.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                      <CardTitle className="text-lg mb-1">{batch.name}</CardTitle>
                      {batch.location && (
                        <p className="text-sm text-gray-600 mb-1">📍 {batch.location}</p>
                      )}
                      {batch.title_reference && (
                        <p className="text-xs text-gray-500">📄 {batch.title_reference}</p>
                      )}
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(batch.id)}
                        aria-label="Modifier"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </IconButton>
                      <IconButton
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setBatchToDelete(batch.id)
                          setDeleteConfirmOpen(true)
                        }}
                        aria-label="Supprimer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </IconButton>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    {batch.price_per_m2_cash && (
                      <Badge variant="info" size="sm">
                        {batch.price_per_m2_cash.toLocaleString()} DA/m²
                      </Badge>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(batch.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Batch Create/Edit Dialog */}
        <Dialog
          open={batchDialogOpen}
          onClose={() => {
            if (!saving) {
              setBatchDialogOpen(false)
              resetForm()
            }
          }}
          title={editingBatchId ? `Modifier le lot: ${batches.find((b) => b.id === editingBatchId)?.name || ''}` : 'Nouveau lot de terrain'}
          size="xl"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setBatchDialogOpen(false)
                  resetForm()
                }}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button onClick={handleSaveBatch} disabled={saving || !batchName.trim()}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Enregistrement...
                  </span>
                ) : (
                  '💾 Enregistrer le lot'
                )}
              </Button>
            </div>
          }
        >
          {error && (
            <div className="mb-4">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          {success && (
            <div className="mb-4">
              <Alert variant="success">{success}</Alert>
            </div>
          )}

          <Tabs
            tabs={[
              { id: 'basic', label: 'Informations de base' },
              { id: 'full-payment', label: 'Paiement comptant' },
              { id: 'offers', label: `Offres de crédit (${installmentOffers.length})` },
            ]}
          >
            {(activeTab) => (
              <>
                {activeTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">
                        Nom du terrain <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                        placeholder="Nom du lot (ex: Aéroport 1)"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">Localisation</Label>
                      <Input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Localisation générale du terrain"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">Référence cadastrale / Numéro</Label>
                      <Input
                        value={titleReference}
                        onChange={(e) => setTitleReference(e.target.value)}
                        placeholder="Numéro de référence cadastrale ou de propriété"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'full-payment' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">
                        Prix au m² (comptant)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={fullPayment.pricePerM2 || ''}
                        onChange={(e) =>
                          setFullPayment((prev) => ({
                            ...prev,
                            pricePerM2: Number(e.target.value || 0),
                          }))
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700 font-medium">
                        Commission de l'entreprise pour paiement comptant (%)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={fullPayment.companyFeePercent || ''}
                        onChange={(e) =>
                          setFullPayment((prev) => ({
                            ...prev,
                            companyFeePercent: Number(e.target.value || 0),
                          }))
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'offers' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold text-blue-900 mb-3">Ajouter une nouvelle offre de crédit</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Nom de l'offre (optionnel)</Label>
                            <Input
                              value={newOffer.name}
                              onChange={(e) => setNewOffer({ ...newOffer, name: e.target.value })}
                              placeholder="Ex: Offre 24 mois"
                              size="sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Prix au m² (crédit) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={newOffer.pricePerM2 || ''}
                              onChange={(e) =>
                                setNewOffer({
                                  ...newOffer,
                                  pricePerM2: Number(e.target.value || 0),
                                })
                              }
                              size="sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Commission de l'entreprise (%)</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={newOffer.companyFeePercent || ''}
                              onChange={(e) =>
                                setNewOffer({
                                  ...newOffer,
                                  companyFeePercent: Number(e.target.value || 0),
                                })
                              }
                              size="sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Acompte</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={newOffer.advanceValue || ''}
                              onChange={(e) =>
                                setNewOffer({
                                  ...newOffer,
                                  advanceValue: Number(e.target.value || 0),
                                })
                              }
                              size="sm"
                            />
                            <div className="flex gap-2 text-xs mt-1">
                              <button
                                type="button"
                                className={`px-2 py-0.5 rounded ${
                                  newOffer.advanceMode === 'fixed'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'text-gray-600'
                                }`}
                                onClick={() =>
                                  setNewOffer((prev) => ({ ...prev, advanceMode: 'fixed' }))
                                }
                              >
                                Montant
                              </button>
                              <button
                                type="button"
                                className={`px-2 py-0.5 rounded ${
                                  newOffer.advanceMode === 'percent'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'text-gray-600'
                                }`}
                                onClick={() =>
                                  setNewOffer((prev) => ({ ...prev, advanceMode: 'percent' }))
                                }
                              >
                                Pourcentage
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Mode de calcul</Label>
                            <div className="flex gap-2 text-xs mb-1">
                              <button
                                type="button"
                                className={`px-2 py-0.5 rounded ${
                                  newOffer.calcMode === 'monthlyAmount'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'text-gray-600'
                                }`}
                                onClick={() =>
                                  setNewOffer((prev) => ({ ...prev, calcMode: 'monthlyAmount' }))
                                }
                              >
                                Montant mensuel
                              </button>
                              <button
                                type="button"
                                className={`px-2 py-0.5 rounded ${
                                  newOffer.calcMode === 'months'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'text-gray-600'
                                }`}
                                onClick={() =>
                                  setNewOffer((prev) => ({ ...prev, calcMode: 'months' }))
                                }
                              >
                                Nombre de mois
                              </button>
                            </div>
                            {newOffer.calcMode === 'monthlyAmount' ? (
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="Montant mensuel"
                                value={newOffer.monthlyAmount || ''}
                                onChange={(e) =>
                                  setNewOffer({
                                    ...newOffer,
                                    monthlyAmount: Number(e.target.value || 0),
                                  })
                                }
                                size="sm"
                              />
                            ) : (
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                placeholder="Nombre de mois"
                                value={newOffer.months || ''}
                                onChange={(e) =>
                                  setNewOffer({
                                    ...newOffer,
                                    months: Number(e.target.value || 0),
                                  })
                                }
                                size="sm"
                              />
                            )}
                          </div>
                        </div>
                        <Button size="sm" onClick={addInstallmentOffer} className="w-full sm:w-auto">
                          + Ajouter l'offre
                        </Button>
                      </div>
                    </div>

                    {installmentOffers.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Offres ajoutées</Label>
                        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                          {installmentOffers.map((offer) => (
                            <div
                              key={offer.id}
                              className="rounded-lg border border-gray-200 bg-white p-3 flex items-start justify-between gap-3"
                            >
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {offer.name || 'Offre sans nom'}
                                  </span>
                                  <Badge variant="info" size="sm">
                                    {offer.pricePerM2.toLocaleString()} DA/m²
                                  </Badge>
                                </div>
                                <div className="text-xs text-gray-600">
                                  Commission: {offer.companyFeePercent || 0}% · Acompte:{' '}
                                  {offer.advanceValue || 0} {offer.advanceMode === 'percent' ? '%' : 'DA'}
                                  {offer.calcMode === 'monthlyAmount'
                                    ? ` · Montant mensuel: ${offer.monthlyAmount || 0} DA`
                                    : ` · Nombre de mois: ${offer.months || 0}`}
                                </div>
                              </div>
                              <IconButton
                                variant="danger"
                                size="sm"
                                onClick={() =>
                                  setInstallmentOffers((prev) =>
                                    prev.filter((o) => o.id !== offer.id),
                                  )
                                }
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </IconButton>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Tabs>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => {
            if (!deleting) {
              setDeleteConfirmOpen(false)
              setBatchToDelete(null)
            }
          }}
          onConfirm={handleDeleteBatch}
          title="Supprimer le lot"
          description="Êtes-vous sûr de vouloir supprimer ce lot ? Toutes les parcelles et offres associées seront supprimées. Cette action est irréversible."
          confirmText={deleting ? 'Suppression...' : 'Oui, supprimer'}
          cancelText="Annuler"
          variant="destructive"
          disabled={deleting}
        />

        {/* Pieces Dialog */}
        <Dialog
          open={piecesDialogOpen}
          onClose={() => {
            setPiecesDialogOpen(false)
            setSelectedBatchId(null)
            setBatchPieces([])
          }}
          title={`Parcelles du lot: ${selectedBatchName}`}
          size="lg"
          footer={
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setPiecesDialogOpen(false)
                  setSelectedBatchId(null)
                  setBatchPieces([])
                }}
              >
                Fermer
              </Button>
            </div>
          }
        >
          {loadingPieces ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-sm text-gray-600">Chargement...</p>
            </div>
          ) : batchPieces.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Aucune parcelle dans ce lot</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <Badge variant="info" size="md">
                  Total parcelles: {batchPieces.length}
                </Badge>
                <Badge variant="default" size="md">
                  Surface totale:{' '}
                  {batchPieces
                    .reduce((sum, p) => sum + (p.surface_m2 || 0), 0)
                    .toLocaleString()}{' '}
                  m²
                </Badge>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
                {batchPieces.map((piece, idx) => (
                  <Card key={piece.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" size="sm">
                            #{idx + 1}
                          </Badge>
                          <span className="font-semibold">Parcelle {piece.piece_number}</span>
                          <Badge
                            variant={
                              piece.status === 'Available'
                                ? 'success'
                                : piece.status === 'Sold'
                                  ? 'default'
                                  : 'warning'
                            }
                            size="sm"
                          >
                            {piece.status === 'Available' ? 'Disponible' : piece.status === 'Sold' ? 'Vendu' : piece.status === 'Reserved' ? 'Réservé' : piece.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Surface:</span>{' '}
                            {piece.surface_m2.toLocaleString()} m²
                          </div>
                          {piece.direct_full_payment_price && (
                            <div>
                              <span className="font-medium">Prix direct:</span>{' '}
                              {piece.direct_full_payment_price.toLocaleString()} DA
                            </div>
                          )}
                        </div>
                        {piece.notes && (
                          <p className="text-xs text-gray-500 mt-1">📝 {piece.notes}</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </div>
  )
}

export default LandPage

