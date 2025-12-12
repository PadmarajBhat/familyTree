
import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', lineHeight: '1.6' }}>
      <h1 style={{ borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>Privacy Policy</h1>
      <p style={{ color: '#666', fontSize: '0.9em' }}>Last Updated: {new Date().toLocaleDateString()}</p>

      <h2>1. Introduction</h2>
      <p>
        Welcome to our Family Tree Application. This is a private, closed-group platform designed exclusively for family members to connect, 
        share, and preserve our shared history. We value the privacy of our family members above all else.
      </p>

      <h2>2. A Closed Group Environment</h2>
      <p>
        This application is not open to the general public. Access is strictly restricted to family members who have been verified and 
        authorized by the administrators. 
      </p>
      <ul>
        <li><strong>Strict Access Control:</strong> Only users with a pre-configured email address in their profile can access the application.</li>
        <li><strong>Mutual Trust:</strong> Information is shared within this closed group based on mutual trust and respect for each other's privacy.</li>
      </ul>

      <h2>3. Information We Collect</h2>
      <p>
        To facilitate the creation of our family tree, we collect and store the following information:
      </p>
      <ul>
        <li><strong>Personal Information:</strong> Names, dates of birth, relationships, and contact details (email/phone) strictly for internal communication.</li>
        <li><strong>Media:</strong> Photos uploaded by family members to identify profiles.</li>
      </ul>

      <h2>4. How We Use Your Information</h2>
      <p>
        The information is used solely for the purpose of:
      </p>
      <ul>
        <li>Visualizing family relationships and lineage.</li>
        <li>Facilitating contact between family members.</li>
        <li>Preserving family history for future generations.</li>
      </ul>
      <p>
        <strong>We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties.</strong>
      </p>

      <h2>5. User Control and Data Rights</h2>
      <p>
        We believe you should have control over your own data:
      </p>
      <ul>
        <li><strong>Editing:</strong> You have the right to edit your own profile information.</li>
        <li><strong>Deletion:</strong> If you are not willing to share certain information, you can remove sensitive details from your profile at any time.</li>
      </ul>

      <h2>6. Contact Us</h2>
      <p>
        If you have any questions or concerns about this privacy policy, please contact the family group administrator.
      </p>

      <div style={{ marginTop: '40px', textAlign: 'center' }}>
        <button 
          onClick={() => window.location.href = '/'}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '1em'
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
