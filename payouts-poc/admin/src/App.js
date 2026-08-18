import React, { useEffect, useState } from 'react';

function App(){
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState([]);
  const [showAudits, setShowAudits] = useState(false);
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedDetail, setSelectedDetail] = useState(null);

  async function fetchPending(){
    if(!token) return;
    setLoading(true);
    const res = await fetch('/admin/withdrawals?status=pending', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    setItems(data);
    setLoading(false);
  }

  useEffect(()=> { if(token) fetchPending(); }, [token]);

  async function approve(id){
    if(!window.confirm('Approve and execute withdrawal '+id+'?')) return;
    const res = await fetch('/withdrawals/' + id + '/confirm', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    if(res.ok){
      alert('Executed');
      fetchPending();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || JSON.stringify(err)));
    }
  }

  async function fetchAudits(){
    if(!token) return;
    setShowAudits(true);
    const res = await fetch('/admin/audit', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    setAudits(data);
  }

  async function login(e){
    e && e.preventDefault();
    const res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if(res.ok){
      const j = await res.json();
      setToken(j.token);
      alert('Login successful');
    } else {
      const err = await res.json();
      alert('Login failed: ' + (err.error || JSON.stringify(err)));
    }
  }

  async function showDetails(id){
    setSelectedDetail(null);
    const [wRes, aRes] = await Promise.all([
      fetch('/withdrawals/' + id),
      fetch('/admin/audit', { headers: { 'Authorization': 'Bearer ' + token } })
    ]);
    const w = await wRes.json();
    const as = await aRes.json();
    const related = as.filter(a => a.withdrawal_id === id);
    setSelectedDetail({ withdrawal: w, audits: related });
  }

  return (
    <div style={{fontFamily:'sans-serif', padding:20}}>
      <h2>Admin — Withdrawals (pending)</h2>

      {!token ? (
        <div style={{marginBottom:20}}>
          <h3>Admin login</h3>
          <form onSubmit={login}>
            <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
            <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{marginLeft:8}} />
            <button style={{marginLeft:8}} type="submit">Login</button>
          </form>
          <p style={{color:'#666'}}>Use server env ADMIN_USER / ADMIN_PASS (PoC)</p>
        </div>
      ) : (
        <div style={{marginBottom:10}}>
          <button onClick={fetchPending} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
          <button onClick={fetchAudits} style={{marginLeft:8}}>Show Audit</button>
        </div>
      )}

      {token && (
        <>
          <table border="1" cellPadding="6" style={{marginTop:10, width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th>id</th><th>user</th><th>currency</th><th>gross</th><th>fee</th><th>net</th><th>dest</th><th>status</th><th>actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}>
                  <td style={{fontFamily:'monospace', cursor:'pointer'}} onClick={()=>showDetails(it.id)}>{it.id}</td>
                  <td>{it.user_id}</td>
                  <td>{it.currency}</td>
                  <td>{it.gross_amount}</td>
                  <td>{it.platform_fee}</td>
                  <td>{it.net_amount}</td>
                  <td style={{fontFamily:'monospace'}}>{it.destination_address}</td>
                  <td>{it.status}</td>
                  <td>
                    <button onClick={()=>approve(it.id)} disabled={it.status !== 'pending'}>Approve & Execute</button>
                  </td>
                </tr>
              ))}
              {items.length===0 && <tr><td colSpan="9">No pending withdrawals</td></tr>}
            </tbody>
          </table>

          {showAudits && (
            <div style={{marginTop:20}}>
              <h3>Admin Audit Log</h3>
              <table border="1" cellPadding="6" style={{width:'100%', borderCollapse:'collapse'}}>
                <thead>
                  <tr><th>time</th><th>admin_token</th><th>action</th><th>withdrawal_id</th><th>tx_hash</th><th>details</th></tr>
                </thead>
                <tbody>
                  {audits.map(a => (
                    <tr key={a.id}>
                      <td>{a.created_at}</td>
                      <td style={{fontFamily:'monospace'}}>{a.admin_token}</td>
                      <td>{a.action}</td>
                      <td style={{fontFamily:'monospace'}}>{a.withdrawal_id}</td>
                      <td style={{fontFamily:'monospace'}}>{a.tx_hash}</td>
                      <td>{a.details}</td>
                    </tr>
                  ))}
                  {audits.length===0 && <tr><td colSpan="6">No audit entries</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {selectedDetail && (
            <div style={{marginTop:20}}>
              <h3>Withdrawal details</h3>
              <pre style={{background:'#f6f6f6',padding:10}}>{JSON.stringify(selectedDetail.withdrawal, null, 2)}</pre>
              <h4>Related audit entries</h4>
              <table border="1" cellPadding="6" style={{width:'100%', borderCollapse:'collapse'}}>
                <thead><tr><th>time</th><th>admin</th><th>action</th><th>tx_hash</th><th>details</th></tr></thead>
                <tbody>
                  {selectedDetail.audits.map(a => (
                    <tr key={a.id}>
                      <td>{a.created_at}</td>
                      <td style={{fontFamily:'monospace'}}>{a.admin_token}</td>
                      <td>{a.action}</td>
                      <td style={{fontFamily:'monospace'}}>{a.tx_hash}</td>
                      <td>{a.details}</td>
                    </tr>
                  ))}
                  {selectedDetail.audits.length===0 && <tr><td colSpan="5">No related audit entries</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
