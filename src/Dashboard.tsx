import { useState, useMemo, useEffect } from 'react'
import {
  Home,
  Settings,
  Plus,
  Edit2,
  Trash2,
  X,
  Upload,
  ChevronDown,
  ChevronUp,
  Search
} from 'lucide-react'
import Papa from 'papaparse'
import { supabase } from './utils/supabase'
import type { House } from './types/house'
import { v4 as uuidV4 } from 'uuid'

const HouseRatingSystem = () => {
  const [weights, setWeights] = useState({
    garageSpaces: 9,
    walkInCloset: 8,
    kitchenIsland: 8,
    distance: 9,
    yardMaintenance: 8,
    hoaFees: 6,
    size: 4,
    yearBuilt: 2,
    price: 2
  })

  const [houses, setHouses] = useState<House[]>([])
  const [sortBy, setSortBy] = useState('score')
  const [uploadError, setUploadError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingHouse, setEditingHouse] = useState<House | null>(null)
  const [budgetLimit, setBudgetLimit] = useState(600000)
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const emptyHouse = {
    id: uuidV4(),
    address: '',
    city: '',
    price: 0,
    bedrooms: 0,
    bathrooms: 0,
    size: 0,
    style: '',
    year_built: 0,
    garage_spaces: 0,
    walk_in_closet: false,
    kitchen_island: false,
    yard_maintenance: false,
    sold: false,
    hoa_fee: 0,
    distance: '',
    calculated_score: 0,
    thumbnail_url: ''
  } as House

  const [formData, setFormData] = useState(emptyHouse)

  const loadHousesFromDB = async () => {
    const { data } = await supabase.from('houses').select('*')
    if (data) {
      setHouses(data)
    }
  }

  const saveHouseToDB = async (house: House) => {
    try {
      const { data } = await supabase.from('houses').insert(house).select('*')
      if (data && data?.length > 0) {
        setHouses((prev) => [...prev, ...data])
        return true
      }
      return false
    } catch (error) {
      console.error('Error saving house to DB:', error)
      return false
    }
  }

  const updateHouseInDB = async (id: string, house: House) => {
    const { data } = await supabase
      .from('houses')
      .update(house)
      .eq('id', id)
      .select('*')
    if (data && data?.length > 0) {
      setHouses((prev) => prev.map((h) => (h.id === id ? data[0] : h)))
      return true
    }
    return false
  }

  const deleteHouseFromDB = async (id: string) => {
    const { data } = await supabase
      .from('houses')
      .delete()
      .eq('id', id)
      .select('*')
    if (data !== null) {
      setHouses((prev) => prev.filter((h) => h.id !== id))
      return true
    }
    return false
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event?.target?.files?.[0]
    if (!file) return

    setUploadError('')

    if (!file.name.endsWith('.csv')) {
      setUploadError('Please upload a CSV file')
      return
    }

    const reader = new FileReader()
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const text = e?.target?.result
        if (typeof text !== 'string') {
          setUploadError('Failed to read file content')
          return
        }
        const parsed = Papa.parse<House>(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        })

        const cleanedHouses = parsed.data.filter(
          (house: House) => house.address && house.address.trim() !== ''
        )

        if (cleanedHouses.length === 0) {
          setUploadError('No valid houses found in CSV')
          return
        }
        for (const house of cleanedHouses) {
          await saveHouseToDB(house)
        }
        setHouses(cleanedHouses)
        setUploadError('')
      } catch (error) {
        setUploadError('Error parsing CSV file')
        console.error(error)
      }
    }
    reader.readAsText(file)
  }

  const calculateScore = (house: House) => {
    let score = 0
    let maxScore = 0

    const garageSpaces = house.garage_spaces || 0
    const garageScore = garageSpaces >= 2 ? 100 : garageSpaces === 1 ? 50 : 0
    score += (garageScore / 100) * weights.garageSpaces
    maxScore += weights.garageSpaces

    const hasWalkIn = house.walk_in_closet === true
    score += hasWalkIn ? weights.walkInCloset : 0
    maxScore += weights.walkInCloset

    const hasKitchen = house.kitchen_island === true
    score += hasKitchen ? weights.kitchenIsland : 0
    maxScore += weights.kitchenIsland

    const distanceStr = (house.distance || '').toString()
    const distanceMatch = distanceStr.match(/(\d+)/)
    const distance = distanceMatch ? parseInt(distanceMatch[1]) : 50
    const distanceScore = Math.max(0, 100 - distance * 2)
    score += (distanceScore / 100) * weights.distance
    maxScore += weights.distance

    const hasHighMaintenanceYard = house.yard_maintenance === true
    score += hasHighMaintenanceYard ? 0 : weights.yardMaintenance
    maxScore += weights.yardMaintenance

    const hoaFees = house.hoa_fee || 0
    const hoaScore = hoaFees === 0 ? 100 : Math.max(0, 100 - hoaFees / 5)
    score += (hoaScore / 100) * weights.hoaFees
    maxScore += weights.hoaFees

    const size = house.size || 1500
    const sizeScore = Math.min(100, Math.max(0, ((size - 1000) / 2500) * 100))
    score += (sizeScore / 100) * weights.size
    maxScore += weights.size

    const yearBuilt = house.year_built || 1950
    const yearScore = Math.min(
      100,
      Math.max(0, ((yearBuilt - 1920) / 105) * 100)
    )
    score += (yearScore / 100) * weights.yearBuilt
    maxScore += weights.yearBuilt

    const price = house.price || 600000
    const priceScore = Math.min(
      100,
      Math.max(0, 100 - ((price - 400000) / 300000) * 100)
    )
    score += (priceScore / 100) * weights.price
    maxScore += weights.price

    return maxScore > 0 ? (score / maxScore) * 100 : 0
  }

  const scoredHouses = useMemo(() => {
    return houses
      .map((house) => ({
        ...house,
        calculated_score: calculateScore(house)
      }))
      .filter((house) => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        return (
          house.address?.toLowerCase().includes(search) ||
          house.city?.toLowerCase().includes(search) ||
          house.style?.toLowerCase().includes(search)
        )
      })
      .sort((a, b) => {
        if (sortBy === 'sold') {
          if (a.sold === b.sold) return 0
          if (a.sold) return 1
          return -1
        }
        if (sortBy === 'score') return b.calculated_score - a.calculated_score
        if (sortBy === 'price') return a?.price - b?.price
        if (sortBy === 'distance') {
          const getDistance = (h: House) => {
            const str = (h.distance || '').toString()
            const match = str.match(/(\d+)/)
            return match ? parseInt(match[1]) : 99
          }
          return getDistance(a) - getDistance(b)
        }
        return 0
      })
  }, [houses, sortBy, weights, searchTerm])

  const handleWeightChange = (key: string, value: string) => {
    setWeights((prev) => ({ ...prev, [key]: parseFloat(value) }))
  }

  const handleFormChange = (
    field: string,
    value: string | number | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (editingHouse) {
      await updateHouseInDB(editingHouse.id, formData)
      setHouses((prev) =>
        prev.map((h) => (h === editingHouse ? { ...formData } : h))
      )
      setEditingHouse(null)
    } else {
      await saveHouseToDB(formData)
    }

    const newEmptyHouse = { ...emptyHouse, id: uuidV4() }
    setFormData(newEmptyHouse)
    setShowAddForm(false)
  }

  const handleEdit = (house: House) => {
    setEditingHouse(house)
    setFormData({ ...house })
    setShowAddForm(true)
  }

  const handleDelete = async (house: House) => {
    if (window.confirm('Are you sure you want to delete this house?')) {
      await deleteHouseFromDB(house.id)
      setHouses((prev) => prev.filter((h) => h !== house))
    }
  }

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0)

  useEffect(() => {
    loadHousesFromDB()
  }, [])

  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6'>
      <div className='max-w-7xl mx-auto'>
        <div className='bg-white rounded-lg shadow-xl p-6 mb-6'>
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <Home className='w-8 h-8 text-indigo-600' />
              <h1 className='text-3xl font-bold text-gray-800'>
                Gabbi's House Rater
              </h1>
            </div>
          </div>

          <div className='mb-6 p-4 bg-gray-50 rounded-lg'>
            <label className='block text-sm font-semibold text-gray-700 mb-2'>
              <Upload className='inline w-4 h-4 mr-2' />
              Upload CSV (Bulk Import)
            </label>
            <input
              type='file'
              accept='.csv'
              onChange={handleFileUpload}
              className='block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100'
            />
            {uploadError && (
              <p className='mt-2 text-sm text-red-600'>{uploadError}</p>
            )}
          </div>

          <div className='grid md:grid-cols-3 gap-4 mb-6'>
            <div className='bg-indigo-50 p-4 rounded-lg'>
              <div className='text-sm text-indigo-600 font-semibold'>
                Total Houses
              </div>
              <div className='text-2xl font-bold text-indigo-900'>
                {houses.length}
              </div>
            </div>
            <div className='bg-green-50 p-4 rounded-lg'>
              <div className='text-sm text-green-600 font-semibold'>
                Top Rated
              </div>
              <div className='text-2xl font-bold text-green-900'>
                {scoredHouses.length > 0
                  ? scoredHouses[0].calculated_score.toFixed(1)
                  : 0}
              </div>
            </div>
            <div className='bg-purple-50 p-4 rounded-lg'>
              <div className='text-sm text-purple-600 font-semibold'>
                Total Weight
              </div>
              <div className='text-2xl font-bold text-purple-900'>
                {totalWeight}
              </div>
            </div>
          </div>

          <div className='mb-6 border border-gray-200 rounded-lg'>
            <button
              onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
              className='w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors'>
              <div className='flex items-center gap-2'>
                <Settings className='w-5 h-5 text-gray-600' />
                <h2 className='text-xl font-semibold text-gray-700'>
                  Adjust Weights & Budget
                </h2>
              </div>
              {isSettingsCollapsed ? (
                <ChevronDown className='w-5 h-5 text-gray-600' />
              ) : (
                <ChevronUp className='w-5 h-5 text-gray-600' />
              )}
            </button>

            {!isSettingsCollapsed && (
              <div className='p-4'>
                <h3 className='text-sm font-semibold text-gray-700 mb-3'>
                  Feature Weights (0-10 higher is more important)
                </h3>
                <div className='grid md:grid-cols-3 gap-4 mb-6'>
                  {Object.entries(weights).map(([key, value]) => (
                    <div key={key} className='bg-gray-50 p-3 rounded'>
                      <label className='block text-sm font-medium text-gray-700 mb-2 capitalize'>
                        {key.replace(/([A-Z])/g, ' $1').trim()}: {value}
                      </label>
                      <input
                        type='range'
                        min='0'
                        max='10'
                        step='1'
                        value={value}
                        onChange={(e) =>
                          handleWeightChange(key, e.target.value)
                        }
                        className='w-full'
                      />
                    </div>
                  ))}
                </div>

                <h3 className='text-sm font-semibold text-gray-700 mb-3'>
                  Budget Limit
                </h3>
                <div className='p-4 bg-gray-50 rounded-lg'>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Maximum Price: ${budgetLimit.toLocaleString()}
                  </label>
                  <input
                    type='range'
                    min='400000'
                    max='700000'
                    step='5000'
                    value={budgetLimit}
                    onChange={(e) => setBudgetLimit(parseInt(e.target.value))}
                    className='w-full'
                  />
                  <div className='flex justify-between text-xs text-gray-500 mt-1'>
                    <span>$400k</span>
                    <span>$700k</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className='mb-4'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400' />
              <input
                type='text'
                placeholder='Search by address, city, or style...'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
              />
            </div>
          </div>

          <div className='flex gap-2 mb-4 flex-wrap'>
            <button
              onClick={() => {
                setShowAddForm(!showAddForm)
                setEditingHouse(null)
                setFormData(emptyHouse)
              }}
              className='flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700'>
              <Plus className='w-4 h-4' />
              Add House
            </button>
            <button
              onClick={() => setSortBy('score')}
              className={`px-4 py-2 rounded ${
                sortBy === 'score' ? 'bg-indigo-600 text-white' : 'bg-gray-200'
              }`}>
              Sort by Score
            </button>
            <button
              onClick={() => setSortBy('price')}
              className={`px-4 py-2 rounded ${
                sortBy === 'price' ? 'bg-indigo-600 text-white' : 'bg-gray-200'
              }`}>
              Sort by Price
            </button>
            <button
              onClick={() => setSortBy('distance')}
              className={`px-4 py-2 rounded ${
                sortBy === 'distance'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200'
              }`}>
              Sort by Distance
            </button>
            <button
              onClick={() => setSortBy('sold')}
              className={`px-4 py-2 rounded ${
                sortBy === 'sold' ? 'bg-indigo-600 text-white' : 'bg-gray-200'
              }`}>
              Sort by Availability
            </button>
          </div>

          {showAddForm && (
            <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
              <div className='fixed inset-0 bg-black/75 z-40 backdrop-blur-sm' />
              <div className='bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50'>
                <div className='sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 flex justify-between items-center'>
                  <h3 className='text-lg sm:text-xl font-semibold text-gray-800'>
                    {editingHouse ? 'Edit House' : 'Add New House'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowAddForm(false)
                      setEditingHouse(null)
                      setFormData(emptyHouse)
                    }}
                    className='text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-full transition-colors'>
                    <X className='w-5 h-5' />
                  </button>
                </div>

                <div className='p-4 sm:p-6'>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <input
                      type='text'
                      placeholder='Address'
                      value={formData.address}
                      onChange={(e) =>
                        handleFormChange('address', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='text'
                      placeholder='City'
                      value={formData.city}
                      onChange={(e) => handleFormChange('city', e.target.value)}
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='number'
                      placeholder='Price'
                      value={formData.price}
                      onChange={(e) =>
                        handleFormChange('price', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='number'
                      placeholder='Bedrooms'
                      value={formData.bedrooms}
                      onChange={(e) =>
                        handleFormChange('bedrooms', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='number'
                      placeholder='Bathrooms'
                      value={formData.bathrooms}
                      onChange={(e) =>
                        handleFormChange('bathrooms', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='number'
                      placeholder='Size (sqft)'
                      value={formData.size}
                      onChange={(e) => handleFormChange('size', e.target.value)}
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='text'
                      placeholder='Style'
                      value={formData.style}
                      onChange={(e) =>
                        handleFormChange('style', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='number'
                      placeholder='Year Built'
                      value={formData.year_built}
                      onChange={(e) =>
                        handleFormChange('year_built', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='number'
                      placeholder='Garage Spaces'
                      value={formData.garage_spaces}
                      onChange={(e) =>
                        handleFormChange('garage_spaces', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='number'
                      placeholder='HOA Fees'
                      value={formData.hoa_fee}
                      onChange={(e) =>
                        handleFormChange('hoa_fee', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='text'
                      placeholder='Distance (e.g., 15 min)'
                      value={formData.distance}
                      onChange={(e) =>
                        handleFormChange('distance', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <input
                      type='text'
                      placeholder='Thumbnail Image URL (optional)'
                      value={formData.thumbnail_url}
                      onChange={(e) =>
                        handleFormChange('thumbnail_url', e.target.value)
                      }
                      className='px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                    />
                    <div className='sm:col-span-2 flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 bg-gray-50 rounded'>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={formData.walk_in_closet}
                          onChange={(e) =>
                            handleFormChange('walk_in_closet', e.target.checked)
                          }
                          className='w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500'
                        />
                        <span className='text-sm'>Walk-in Closet</span>
                      </label>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={formData.kitchen_island}
                          onChange={(e) =>
                            handleFormChange('kitchen_island', e.target.checked)
                          }
                          className='w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500'
                        />
                        <span className='text-sm'>Kitchen Island</span>
                      </label>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={formData.yard_maintenance}
                          onChange={(e) =>
                            handleFormChange(
                              'yard_maintenance',
                              e.target.checked
                            )
                          }
                          className='w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500'
                        />
                        <span className='text-sm'>High Maintenance Yard</span>
                      </label>
                      <label className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={formData.sold}
                          onChange={(e) =>
                            handleFormChange('sold', e.target.checked)
                          }
                          className='w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500'
                        />
                        <span className='text-sm'>Sold</span>
                      </label>
                    </div>
                  </div>

                  <div className='mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end'>
                    <button
                      onClick={() => {
                        setShowAddForm(false)
                        setEditingHouse(null)
                        setFormData(emptyHouse)
                      }}
                      className='px-6 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors'>
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmit}
                      className='px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors'>
                      {editingHouse ? 'Update House' : 'Add House'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className='space-y-4'>
          {scoredHouses.map((house, idx) => (
            <div
              key={idx}
              className='bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow'>
              <div className='grid grid-cols-1 md:grid-cols-4 gap-4 w-full'>
                {house.thumbnail_url && (
                  <div className='w-full h-49 bg-gray-200 col-span-1'>
                    <img
                      src={house.thumbnail_url}
                      alt={house.address}
                      className='w-full h-full object-cover'
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                )}
                <div className='p-4 md:p-6 w-full col-span-1 md:col-span-3'>
                  <div className='flex justify-between items-start mb-3'>
                    <div className='flex-1'>
                      <a
                        href={`https://www.zillow.com/homes/${encodeURIComponent(
                          house.address
                        )}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-lg font-bold text-indigo-600 hover:text-indigo-800 hover:underline'>
                        {house.address}
                      </a>
                      <p className='text-sm text-gray-600'>
                        {house.city} • {house.style}
                      </p>
                    </div>
                    <div className='flex items-center gap-3'>
                      <div className='text-right'>
                        <div className='text-2xl font-bold text-indigo-600'>
                          {house.calculated_score.toFixed(1)}
                        </div>
                        <div className='text-xs text-gray-500'>Score</div>
                      </div>
                      <button
                        onClick={() => handleEdit(house)}
                        className='p-2 text-blue-600 hover:bg-blue-50 rounded'>
                        <Edit2 className='w-4 h-4' />
                      </button>
                      <button
                        onClick={() => handleDelete(house)}
                        className='p-2 text-red-600 hover:bg-red-50 rounded'>
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </div>

                  <div className='grid grid-cols-2 md:grid-cols-4 gap-3 text-sm'>
                    <div>
                      <span className='font-semibold'>Price:</span> $
                      {(house.price || 0).toLocaleString()}
                    </div>
                    <div>
                      <span className='font-semibold'>Size:</span> {house.size}{' '}
                      sqft
                    </div>
                    <div>
                      <span className='font-semibold'>Beds/Baths:</span>{' '}
                      {house.bedrooms} bed / {house.bathrooms} bath
                    </div>
                    <div>
                      <span className='font-semibold'>Year:</span>{' '}
                      {house.year_built}
                    </div>
                    <div>
                      <span className='font-semibold'>Garage:</span>{' '}
                      {house.garage_spaces} spaces
                    </div>
                    <div>
                      <span className='font-semibold'>
                        Distance from A & G:
                      </span>{' '}
                      {house.distance || 'N/A'}
                    </div>
                    <div>
                      <span className='font-semibold'>HOA:</span> $
                      {house.hoa_fee || 0}/mo
                    </div>
                  </div>

                  <div className='flex gap-2 mt-3 flex-wrap'>
                    {(house.price || 0) > budgetLimit && (
                      <span className='px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-semibold'>
                        Over Budget
                      </span>
                    )}
                    {house.walk_in_closet && (
                      <span className='px-2 py-1 bg-green-100 text-green-700 text-xs rounded'>
                        Walk-in Closet
                      </span>
                    )}
                    {house.kitchen_island && (
                      <span className='px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded'>
                        Kitchen Island
                      </span>
                    )}
                    {!house.yard_maintenance && (
                      <span className='px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded'>
                        Low/No Yard
                      </span>
                    )}
                    {house.sold && (
                      <span className='px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded font-semibold'>
                        Sold
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HouseRatingSystem
