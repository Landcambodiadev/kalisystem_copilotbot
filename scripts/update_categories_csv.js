const fs = require('fs');
const path = require('path');

// Paths
const categoriesJsonPath = path.join(__dirname, '../data/categories.json');
const categoriesCsvPath = path.join(__dirname, '../data/categories.csv');

function updateCategoriesCSV() {
  try {
    // Read categories.json
    console.log('Reading categories.json...');
    const jsonData = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));
    
    // Create CSV header
    const csvHeader = 'category_id,category_name,parent_category';
    
    // Convert JSON to CSV rows
    const csvRows = jsonData.map(category => {
      const categoryId = category.category_id || '';
      const categoryName = category.category_name || '';
      const parentCategory = category.parent_category || '';
      
      // Escape values that contain commas by wrapping in quotes
      const escapedCategoryName = categoryName.includes(',') ? `"${categoryName}"` : categoryName;
      const escapedParentCategory = parentCategory.includes(',') ? `"${parentCategory}"` : parentCategory;
      
      return `${categoryId},${escapedCategoryName},${escapedParentCategory}`;
    });
    
    // Combine header and rows
    const csvContent = [csvHeader, ...csvRows].join('\n');
    
    // Backup existing CSV if it exists
    if (fs.existsSync(categoriesCsvPath)) {
      const backupPath = `${categoriesCsvPath}.bak_${Date.now()}`;
      fs.copyFileSync(categoriesCsvPath, backupPath);
      console.log(`Backup created: ${backupPath}`);
    }
    
    // Write new CSV
    fs.writeFileSync(categoriesCsvPath, csvContent);
    console.log(`Successfully updated ${categoriesCsvPath}`);
    console.log(`Converted ${jsonData.length} categories from JSON to CSV`);
    
  } catch (error) {
    console.error('Error updating categories.csv:', error);
    process.exit(1);
  }
}

// Run the update
updateCategoriesCSV();