const axios = require('axios');

async function triggerAIReview() {
  try {
    console.log('🚀 Triggering AI review for all pending applications...\n');
    
    const response = await axios.post('http://localhost:5000/api/admin/instructors/trigger-ai-review', {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Response:', response.data);
    console.log('\n📊 Summary:');
    console.log('- Success:', response.data.successCount || 0);
    console.log('- Failed:', response.data.failedCount || 0);
    console.log('- Total:', response.data.totalProcessed || 0);
    
    if (response.data.results && response.data.results.length > 0) {
      console.log('\n📝 Details:');
      response.data.results.forEach((result, i) => {
        console.log(`\n${i + 1}. Profile: ${result.profileId}`);
        console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
        if (result.message) console.log(`   Message: ${result.message}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error triggering AI review:', error.response?.data || error.message);
    process.exit(1);
  }
}

triggerAIReview();
