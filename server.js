const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Helper functions
const readJSON = (file) => {
  const filePath = path.join(__dirname, 'data', file);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return [];
  }
};

const writeJSON = (file, data) => {
  const filePath = path.join(__dirname, 'data', file);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
};

const saveBase64Image = (base64String, folder, filename) => {
  if (!base64String) return null;
  
  // More lenient base64 string checking
  const base64Data = base64String.split(';base64,').pop();
  if (!base64Data) return null;

  // Default to jpeg if we can't determine type
  let fileExt = 'jpg';
  let mimeType = 'image/jpeg';

  // Try to extract mime type if present
  if (base64String.startsWith('data:')) {
    const mimeMatch = base64String.match(/^data:(image\/\w+);/);
    if (mimeMatch && mimeMatch[1]) {
      mimeType = mimeMatch[1];
      const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg'
      };
      fileExt = extensions[mimeType.toLowerCase()] || 'jpg';
    }
  }

  const filePath = path.join(__dirname, 'uploads', folder, `${filename}.${fileExt}`);
  
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, base64Data, 'base64');
    return `/uploads/${folder}/${filename}.${fileExt}`;
  } catch (err) {
    console.error('Error saving image:', err);
    return null;
  }
};

const deleteFile = (filePath) => {
  if (!filePath || filePath.startsWith('http')) return;
  
  try {
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted file: ${filePath}`);
    }
  } catch (err) {
    console.error('Error deleting file:', err);
  }
};

const deleteUserFiles = (userId) => {
  try {
    // Delete user's profile picture
    const users = readJSON('users.json');
    const user = users.find(u => u.id === userId);
    if (user && user.profilePic) {
      deleteFile(user.profilePic);
    }

    // Delete all item images for this user
    const items = readJSON('items.json');
    items
      .filter(item => item.userId === userId && item.itemImage)
      .forEach(item => deleteFile(item.itemImage));
  } catch (err) {
    console.error('Error deleting user files:', err);
  }
};

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const users = readJSON('users.json');
  const user = users.find(u => u.id === token);
  if (!user) return res.status(401).json({ error: 'Unauthorized - Account may have been deleted' });
  
  req.user = user;
  next();
};

// Initialize data directories
function initializeDirectories() {
  const directories = [
    path.join(__dirname, 'data'),
    path.join(__dirname, 'uploads', 'users'),
    path.join(__dirname, 'uploads', 'items'),
    path.join(__dirname, 'public')
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const jsonFiles = [
    path.join(__dirname, 'data', 'users.json'),
    path.join(__dirname, 'data', 'items.json'),
    path.join(__dirname, 'data', 'activities.json')
  ];

  jsonFiles.forEach(file => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '[]');
    }
  });
}

// HTML Page Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/homepage.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});

app.get('/post-items.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'post-items.html'));
});

app.get('/markets.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'markets.html'));
});

app.get('/analysis.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'analysis.html'));
});

app.get('/stock-analysis.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stock-analysis.html'));
});

app.get('/settings.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API Routes

// User registration
app.post('/api/register', (req, res) => {
  try {
    const userData = req.body;
    const users = readJSON('users.json');
    
    if (users.some(u => u.email === userData.email)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const newUser = {
      id: Date.now().toString(),
      ...userData,
      password: userData.password || 'defaultPassword',
      createdAt: new Date().toISOString(),
      profilePic: userData.profilePic ? saveBase64Image(userData.profilePic, 'users', Date.now().toString()) : 'https://via.placeholder.com/150'
    };

    users.push(newUser);
    writeJSON('users.json', users);

    res.json({ 
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        profilePic: newUser.profilePic,
        businessName: newUser.businessName,
        businessType: newUser.businessType
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User login
app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readJSON('users.json');
    
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ 
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic,
        businessName: user.businessName,
        businessType: user.businessType
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (for admin)
app.get('/api/admin/users', (req, res) => {
  try {
    const users = readJSON('users.json');
    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single user (for admin)
app.get('/api/admin/users/:id', (req, res) => {
  try {
    const users = readJSON('users.json');
    const user = users.find(u => u.id === req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (for admin)
app.delete('/api/admin/users/:id', (req, res) => {
  try {
    deleteUserFiles(req.params.id);

    let users = readJSON('users.json');
    users = users.filter(u => u.id !== req.params.id);
    writeJSON('users.json', users);

    let items = readJSON('items.json');
    items = items.filter(item => item.userId !== req.params.id);
    writeJSON('items.json', items);

    let activities = readJSON('activities.json');
    activities = activities.filter(act => act.userId !== req.params.id);
    writeJSON('activities.json', activities);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user data
app.get('/api/user/:id', authenticate, (req, res) => {
  res.json(req.user);
});

// Update user profile
app.put('/api/user/:id', authenticate, (req, res) => {
  try {
    const users = readJSON('users.json');
    const userIndex = users.findIndex(u => u.id === req.params.id);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found - Account may have been deleted' });
    }

    const updatedData = {
      ...users[userIndex],
      ...req.body
    };

    if (req.body.profilePic) {
      if (users[userIndex].profilePic && !users[userIndex].profilePic.startsWith('http')) {
        deleteFile(users[userIndex].profilePic);
      }
      updatedData.profilePic = saveBase64Image(req.body.profilePic, 'users', req.params.id) || users[userIndex].profilePic;
    }

    users[userIndex] = updatedData;
    writeJSON('users.json', users);

    res.json({ success: true, user: updatedData });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user account
app.delete('/api/user/:id', authenticate, (req, res) => {
  try {
    deleteUserFiles(req.params.id);

    let users = readJSON('users.json');
    users = users.filter(u => u.id !== req.params.id);
    writeJSON('users.json', users);

    let items = readJSON('items.json');
    items = items.filter(item => item.userId !== req.params.id);
    writeJSON('items.json', items);

    let activities = readJSON('activities.json');
    activities = activities.filter(act => act.userId !== req.params.id);
    writeJSON('activities.json', activities);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Inventory items
app.post('/api/items', authenticate, (req, res) => {
  try {
    const itemData = req.body;
    const items = readJSON('items.json');
    
    const newItem = {
      id: Date.now().toString(),
      userId: req.user.id,
      ...itemData,
      dateAdded: new Date().toISOString(),
      itemImage: itemData.itemImage ? saveBase64Image(itemData.itemImage, 'items', Date.now().toString()) : null
    };

    items.push(newItem);
    writeJSON('items.json', items);

    res.json({ success: true, item: newItem });
  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all items for current user
app.get('/api/items', authenticate, (req, res) => {
  try {
    const items = readJSON('items.json');
    res.json(items.filter(item => item.userId === req.user.id));
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single item
app.get('/api/items/:id', authenticate, (req, res) => {
  try {
    const items = readJSON('items.json');
    const item = items.find(item => item.id === req.params.id && item.userId === req.user.id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update item
app.put('/api/items/:id', authenticate, (req, res) => {
  try {
    const items = readJSON('items.json');
    const itemIndex = items.findIndex(item => item.id === req.params.id && item.userId === req.user.id);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = {
      ...items[itemIndex],
      ...req.body
    };

    if (req.body.itemImage) {
      if (items[itemIndex].itemImage && !items[itemIndex].itemImage.startsWith('http')) {
        deleteFile(items[itemIndex].itemImage);
      }
      updatedItem.itemImage = saveBase64Image(req.body.itemImage, 'items', req.params.id) || items[itemIndex].itemImage;
    }

    items[itemIndex] = updatedItem;
    writeJSON('items.json', items);

    res.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete item
app.delete('/api/items/:id', authenticate, (req, res) => {
  try {
    const items = readJSON('items.json');
    const itemIndex = items.findIndex(item => item.id === req.params.id && item.userId === req.user.id);
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const itemToDelete = items[itemIndex];
    if (itemToDelete.itemImage) {
      deleteFile(itemToDelete.itemImage);
    }

    const updatedItems = items.filter(item => item.id !== req.params.id);
    writeJSON('items.json', updatedItems);

    let activities = readJSON('activities.json');
    activities = activities.filter(act => act.itemId !== req.params.id);
    writeJSON('activities.json', activities);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Record sale
app.post('/api/sales', authenticate, (req, res) => {
  try {
    const saleData = req.body;
    const items = readJSON('items.json');
    const activities = readJSON('activities.json');
    
    const itemIndex = items.findIndex(i => i.id === saleData.itemId && i.userId === req.user.id);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (items[itemIndex].stock < saleData.quantity) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    items[itemIndex].stock -= saleData.quantity;
    writeJSON('items.json', items);

    const activity = {
      id: Date.now().toString(),
      userId: req.user.id,
      itemId: saleData.itemId,
      itemName: items[itemIndex].name,
      type: 'sale',
      quantity: saleData.quantity,
      amount: saleData.amount,
      date: new Date().toISOString()
    };
    activities.push(activity);
    writeJSON('activities.json', activities);

    res.json({ 
      success: true, 
      sale: {
        itemId: saleData.itemId,
        quantity: saleData.quantity,
        amount: saleData.amount,
        date: activity.date
      }
    });
  } catch (error) {
    console.error('Record sale error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Record loss (damaged, stolen, or expired items)
app.post('/api/losses', authenticate, (req, res) => {
  try {
    const lossData = req.body;
    const items = readJSON('items.json');
    const activities = readJSON('activities.json');
    
    const itemIndex = items.findIndex(i => i.id === lossData.itemId && i.userId === req.user.id);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (items[itemIndex].stock < lossData.quantity) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    items[itemIndex].stock -= lossData.quantity;
    writeJSON('items.json', items);

    const activity = {
      id: Date.now().toString(),
      userId: req.user.id,
      itemId: lossData.itemId,
      itemName: items[itemIndex].name,
      type: 'loss',
      lossType: lossData.type,
      quantity: lossData.quantity,
      amount: lossData.amount,
      date: new Date().toISOString()
    };
    activities.push(activity);
    writeJSON('activities.json', activities);

    res.json({ 
      success: true, 
      loss: {
        itemId: lossData.itemId,
        type: lossData.type,
        quantity: lossData.quantity,
        amount: lossData.amount,
        date: activity.date
      }
    });
  } catch (error) {
    console.error('Record loss error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard data
app.get('/api/dashboard', authenticate, (req, res) => {
  try {
    const items = readJSON('items.json');
    const activities = readJSON('activities.json');
    const userItems = items.filter(item => item.userId === req.user.id);
    
    const totalStock = userItems.reduce((sum, item) => sum + (item.stock || 0), 0);
    const monthlyRevenue = activities
      .filter(act => act.userId === req.user.id && act.type === 'sale')
      .reduce((sum, act) => sum + (act.amount || 0), 0);
    
    const monthlyLosses = activities
      .filter(act => act.userId === req.user.id && act.type === 'loss')
      .reduce((sum, act) => sum + (act.amount || 0), 0);
    
    const recentActivities = activities
      .filter(act => act.userId === req.user.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
    
    res.json({
      totalStock,
      monthlyRevenue,
      monthlyLosses,
      recentActivities
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analysis data
app.get('/api/analysis', authenticate, (req, res) => {
  try {
    const items = readJSON('items.json');
    const activities = readJSON('activities.json');
    const userItems = items.filter(item => item.userId === req.user.id);
    const userActivities = activities.filter(act => act.userId === req.user.id);
    
    const totalRevenue = userActivities
      .filter(act => act.type === 'sale')
      .reduce((sum, act) => sum + (act.amount || 0), 0);
    
    const totalLosses = userActivities
      .filter(act => act.type === 'loss')
      .reduce((sum, act) => sum + (act.amount || 0), 0);
    
    const itemsSold = userActivities
      .filter(act => act.type === 'sale')
      .reduce((sum, act) => sum + (act.quantity || 0), 0);
    
    const itemsLost = userActivities
      .filter(act => act.type === 'loss')
      .reduce((sum, act) => sum + (act.quantity || 0), 0);
    
    const monthlySales = {
      labels: [],
      data: []
    };
    
    const monthlyLosses = {
      labels: [],
      data: []
    };
    
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleString('default', { month: 'short' });
      monthlySales.labels.push(monthName);
      monthlyLosses.labels.push(monthName);
      
      const monthSales = userActivities
        .filter(act => act.type === 'sale' && 
          new Date(act.date).getMonth() === date.getMonth() && 
          new Date(act.date).getFullYear() === date.getFullYear())
        .reduce((sum, act) => sum + (act.amount || 0), 0);
      
      const monthLosses = userActivities
        .filter(act => act.type === 'loss' && 
          new Date(act.date).getMonth() === date.getMonth() && 
          new Date(act.date).getFullYear() === date.getFullYear())
        .reduce((sum, act) => sum + (act.amount || 0), 0);
      
      monthlySales.data.push(monthSales);
      monthlyLosses.data.push(monthLosses);
    }
    
    const itemSales = {};
    userActivities
      .filter(act => act.type === 'sale')
      .forEach(act => {
        if (!itemSales[act.itemId]) {
          itemSales[act.itemId] = {
            name: act.itemName,
            quantity: 0
          };
        }
        itemSales[act.itemId].quantity += act.quantity;
      });
    
    const topItems = Object.entries(itemSales)
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 5);
    
    const topItemsData = {
      labels: topItems.map(item => item[1].name),
      data: topItems.map(item => item[1].quantity)
    };
    
    const lossTypes = {};
    userActivities
      .filter(act => act.type === 'loss')
      .forEach(act => {
        if (!lossTypes[act.lossType]) {
          lossTypes[act.lossType] = 0;
        }
        lossTypes[act.lossType] += act.quantity;
      });
    
    const lossTypesData = {
      labels: Object.keys(lossTypes),
      data: Object.values(lossTypes)
    };
    
    res.json({
      totalRevenue,
      totalLosses,
      itemsSold,
      itemsLost,
      monthlySales,
      monthlyLosses,
      topItems: topItemsData,
      lossTypes: lossTypesData
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
initializeDirectories();
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});