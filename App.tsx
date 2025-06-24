// Internal Task & Bug Tracker with react-native-sqlite-storage for Bare React Native

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

const roles = ['Admin', 'Manager', 'Employee'];
const taskTypes = ['Bug', 'Issue', 'Task'];
const taskStatuses = ['TO DO', 'IN PROGRESS', 'TESTING', 'COMPLETED'];

export default function App() {
  const [db, setDb] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState('Employee');
  const [username, setUsername] = useState('');

  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projectMembers, setProjectMembers] = useState({});

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [taskAssignees, setTaskAssignees] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [taskType, setTaskType] = useState(taskTypes[0]);
  const [taskStatus, setTaskStatus] = useState(taskStatuses[0]);
  const [taskReporter, setTaskReporter] = useState('');

  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('Employee');
  const [selectedMembers, setSelectedMembers] = useState([]);

  useEffect(() => {
    SQLite.openDatabase({ name: 'taskmanager.db', location: 'default' })
      .then((dbInstance) => {
        setDb(dbInstance);
      })
      .catch((error) => {
        console.error('SQLite open error: ', error);
      });
  }, []);

  useEffect(() => {
    if (db) {
      initializeDatabase();
    }
  }, [db]);

  const initializeDatabase = async () => {
    try {
      await db.executeSql('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, role TEXT);');
      await db.executeSql('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, created_by TEXT);');
      // await db.executeSql('CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT);');
      await db.executeSql('CREATE TABLE IF NOT EXISTS project_members (project_id INTEGER, username TEXT);');
      // Add new columns if not exist
      await db.executeSql('ALTER TABLE tasks ADD COLUMN type TEXT;').catch(()=>{});
      await db.executeSql('ALTER TABLE tasks ADD COLUMN status TEXT;').catch(()=>{});
      await db.executeSql('ALTER TABLE tasks ADD COLUMN reporter TEXT;').catch(()=>{});
      await db.executeSql('ALTER TABLE projects ADD COLUMN created_by TEXT;').catch(()=>{});
      await db.executeSql('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, assignedTo TEXT, project_id INTEGER, type TEXT, status TEXT, reporter TEXT);');
      await db.executeSql('INSERT OR IGNORE INTO users (username, role) VALUES (?, ?);', ['Admin', 'Admin']);
      loadUsers();
      loadProjects();
    } catch (error) {
      console.error('DB Initialization Error: ', error);
    }
  };

  const loadUsers = () => {
    if (!db) return;
    db.executeSql('SELECT * FROM users;', []).then(([results]) => {
      const rows = results.rows;
      let items = [];
      for (let i = 0; i < rows.length; i++) {
        items.push(rows.item(i));
      }
      setUsers(items);
    });
  };

  const loadProjects = async () => {
    if (!db) return;
    const projectResults = await db.executeSql('SELECT * FROM projects;', []);
    const projectData = [];
    const rows = projectResults[0].rows;
    for (let i = 0; i < rows.length; i++) {
      projectData.push(rows.item(i));
    }
    setProjects(projectData);

    const memberResults = await db.executeSql('SELECT * FROM project_members;', []);
    const memberMap = {};
    const memRows = memberResults[0].rows;
    for (let i = 0; i < memRows.length; i++) {
      const { project_id, username } = memRows.item(i);
      if (!memberMap[project_id]) memberMap[project_id] = [];
      memberMap[project_id].push(username);
    }
    setProjectMembers(memberMap);

    const taskResults = await db.executeSql('SELECT * FROM tasks;', []);
    const taskData = [];
    const taskRows = taskResults[0].rows;
    for (let i = 0; i < taskRows.length; i++) {
      taskData.push(taskRows.item(i));
    }
    setTasks(taskData);
  };

  const login = () => {
    if (!db) return;
    db.executeSql('SELECT * FROM users WHERE username = ?;', [username])
      .then(([results]) => {
        if (results.rows.length > 0) {
          const user = results.rows.item(0);
          setRole(user.role);
          setLoggedIn(true);
        } else {
          alert('User not found');
        }
      })
      .catch(err => console.error('Login error', err));
  };

  const addUser = () => {
    if (!db) return;
    db.executeSql('INSERT INTO users (username, role) VALUES (?, ?);', [newUserName, newUserRole]).then(() => {
      setNewUserName('');
      setNewUserRole('Employee');
      setShowUserModal(false);
      loadUsers();
    });
  };

  const handleDeleteUser = (usernameToDelete) => {
    if (!db) return;
    db.executeSql('DELETE FROM users WHERE username = ?;', [usernameToDelete]).then(() => {
      loadUsers();
    });
  };

  const addProject = () => {
    if (!db) return;
    db.executeSql('INSERT INTO projects (title, created_by) VALUES (?, ?);', [newProjectTitle, username]).then(([result]) => {
      const projectId = result.insertId;
      selectedMembers.forEach(member => {
        db.executeSql('INSERT INTO project_members (project_id, username) VALUES (?, ?);', [projectId, member]);
      });
      setNewProjectTitle('');
      setSelectedMembers([]);
      setShowProjectModal(false);
      loadProjects();
    });
  };

  const handleDeleteProject = (projectId) => {
    if (!db) return;
    // Delete related tasks and members first (to maintain referential integrity)
    db.executeSql('DELETE FROM tasks WHERE project_id = ?;', [projectId]).then(() => {
      db.executeSql('DELETE FROM project_members WHERE project_id = ?;', [projectId]).then(() => {
        db.executeSql('DELETE FROM projects WHERE id = ?;', [projectId]).then(() => {
          // If the deleted project was selected, deselect it
          if (selectedProject && selectedProject.id === projectId) {
            setSelectedProject(null);
          }
          loadProjects();
        });
      });
    });
  };

  const saveTask = () => {
    if (!db) return;
    if (editingTask) {
      db.executeSql(
        'UPDATE tasks SET name = ?, assignedTo = ?, type = ?, status = ?, reporter = ? WHERE id = ?;',
        [newTaskName, taskAssignees.join(', '), taskType, taskStatus, taskReporter, editingTask.id]
      ).then(() => {
        setNewTaskName('');
        setTaskAssignees([]);
        setTaskType(taskTypes[0]);
        setTaskStatus(taskStatuses[0]);
        setTaskReporter('');
        setShowTaskModal(false);
        setEditingTask(null);
        loadProjects();
      });
    } else {
      db.executeSql(
        'INSERT INTO tasks (name, assignedTo, project_id, type, status, reporter) VALUES (?, ?, ?, ?, ?, ?);',
        [newTaskName, taskAssignees.join(', '), selectedProject.id, taskType, taskStatus, taskReporter]
      ).then(() => {
        setNewTaskName('');
        setTaskAssignees([]);
        setTaskType(taskTypes[0]);
        setTaskStatus(taskStatuses[0]);
        setTaskReporter('');
        setShowTaskModal(false);
        loadProjects();
      });
    }
  };

  const handleDeleteTask = (taskId) => {
    if (!db) return;
    db.executeSql('DELETE FROM tasks WHERE id = ?;', [taskId]).then(() => {
      loadProjects();
    });
  };

  if (!loggedIn) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Login</Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
        />
        <Button title="Login" onPress={login} />
      </View>
    );
  }

  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFDBBE' }}>
        <Text style={styles.heading}>Welcome, {username}</Text>
        <View style={styles.container}>

          {role === 'Admin' && (
            <View>
              <TouchableOpacity style={styles.addButton} onPress={() => setShowUserModal(true)}>
                <Text style={{ color: '#FFF', textAlign: 'center', fontWeight: 500 }}>Add User</Text>
              </TouchableOpacity>
              <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>All Users:</Text>
              <FlatList
                data={users}
                keyExtractor={(item) => item.username}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 5, backgroundColor: '#eee', marginBottom: 10, borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <Text style={{ padding: 8, backgroundColor: '#eee', fontSize: 14, fontWeight: 500 }}>
                      {item.username} ({item.role})
                    </Text>
                    {item.role !== 'Admin' && (
                      <TouchableOpacity
                        onPress={() => handleDeleteUser(item.username)}
                        style={{ padding: 5 }}
                      >
                        <Text style={{ fontSize: 16, color: 'red' }}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              />
            </View>
          )}

          {role === 'Manager' && !selectedProject && (
            <View>
              <TouchableOpacity style={styles.addButton} onPress={() => setShowProjectModal(true)}>
                <Text style={{ color: '#FFF', textAlign: 'center', fontWeight: 500 }}>Add Project</Text>
              </TouchableOpacity>
              <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Your Projects: </Text>
              <FlatList
                data={projects.filter(p => p.created_by === username)}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 5, backgroundColor: '#eee', marginBottom: 10, borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <TouchableOpacity onPress={() => setSelectedProject(item)} style={{ flex: 1 }}>
                      <Text style={{ padding: 8, backgroundColor: '#eee', fontSize: 14, fontWeight: 500 }}>{item.title}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteProject(item.id)}
                      style={{ padding: 5 }}
                    >
                      <Text style={{ fontSize: 16, color: 'red' }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            </View>
          )}

          {(role === 'Employee' || role === 'Manager') && selectedProject && (
            <View>
              {role === 'Manager' && (
                <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 20 }}>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setSelectedProject(null)}>
                      <Text style={{ color: 'black', textAlign: 'center', fontWeight: 500 }}>Back</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity style={styles.addButton} onPress={() => {
                      setEditingTask(null); // <-- Reset editing
                      setNewTaskName('');
                      setTaskAssignees([]);
                      setShowTaskModal(true);
                    }}>
                      <Text style={{ color: '#FFF', textAlign: 'center', fontWeight: 500 }}>Add Task</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <Text style={{ marginTop: 20, marginBottom: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Project: {selectedProject.title}</Text>
              <FlatList
                data={tasks.filter(task => task.project_id === selectedProject.id)}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 5, backgroundColor: '#eee', marginVertical: 10, borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingTask(item); // <-- Set editing task
                        setNewTaskName(item.name);
                        setTaskAssignees(item.assignedTo ? item.assignedTo.split(', ') : []);
                        setTaskType(item.type || taskTypes[0]);
                        setTaskStatus(item.status || taskStatuses[0]);
                        setTaskReporter(item.reporter || '');
                        setShowTaskModal(true);
                      }}
                      style={{ flex: 1 }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ padding: 8, backgroundColor: '#eee', fontSize: 14, fontWeight: 500 }}>{item.name}</Text>
                        <TouchableOpacity
                          onPress={() => handleDeleteTask(item.id)}
                          style={{ padding: 5 }}
                        >
                          <Text style={{ fontSize: 16, color: 'red' }}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row' }}>
                        <View style={{ flexDirection: 'row', padding: 8, width: '50%' }}>
                          <Text style={{ backgroundColor: '#eee', fontSize: 12, color: '#666', fontWeight: 600 }}>Type: </Text>
                          <Text style={{ backgroundColor: '#eee', fontSize: 12, color: '#666' }}>{item.type}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', padding: 8 }}>
                          <Text style={{ backgroundColor: '#eee', fontSize: 12, color: '#666', fontWeight: 600 }}>Status: </Text>
                          <Text
                            style={{ 
                              fontSize: 10,
                              borderRadius: 5,
                              padding: 2,
                              fontWeight: 500,
                              backgroundColor:
                                item.status === 'TO DO'
                                  ? '#666'
                                  : item.status === 'COMPLETED'
                                  ? 'green'
                                  : item.status === 'TESTING'
                                  ? '#D9534F'
                                  : item.status === 'IN PROGRESS'
                                  ? '#0096FF'
                                  : 'black',
                              color:
                                item.status === 'TO DO'
                                  ? '#FFF'
                                  : item.status === 'COMPLETED'
                                  ? '#FFF'
                                  : item.status === 'TESTING'
                                  ? '#FFF'
                                  : item.status === 'IN PROGRESS'
                                  ? '#FFF'
                                  : '#FFF',
                            }}
                          >{item.status}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row' }}>
                        <View style={{ flexDirection: 'row', padding: 8, width: '50%' }}>
                          <Text style={{ backgroundColor: '#eee', fontSize: 12, color: '#666', fontWeight: 600 }}>Assignee(s): </Text>
                          <Text style={{ backgroundColor: '#eee', fontSize: 12, color: '#666', maxWidth: '50%' }}>{item.assignedTo}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', padding: 8 }}>
                          <Text style={{ backgroundColor: '#eee', fontSize: 12, color: '#666', fontWeight: 600 }}>Reporter: </Text>
                          <Text style={{ backgroundColor: '#eee', fontSize: 12, color: '#666' }}>{item.reporter}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              />
            </View>
          )}

          <Modal visible={showProjectModal} animationType="slide">
            <View style={styles.container}>
              <Text style={styles.heading}>New Project</Text>
              <TextInput
                style={styles.input}
                placeholder="Project Title"
                value={newProjectTitle}
                onChangeText={setNewProjectTitle}
              />
              <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Select Members:</Text>
              <FlatList
                data={users.filter(u => u.role === 'Employee')}
                keyExtractor={(item) => item.username}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 5, backgroundColor: selectedMembers.includes(item.username) ? '#aaa' : '#eee', marginBottom: 10, borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => {
                      setSelectedMembers(prev =>
                        prev.includes(item.username)
                          ? prev.filter(m => m !== item.username)
                          : [...prev, item.username]
                      );
                    }}>
                      <Text style={{ padding: 8, fontSize: 14, fontWeight: 500 }}>{item.username}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
              <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 20 }}>
                <View style={{ flex:1 }}>
                  <TouchableOpacity style={styles.saveButton} onPress={addProject}>
                    <Text style={{ color: '#FFF', textAlign: 'center', fontWeight: 500 }}>Save</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex:1 }}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setShowProjectModal(false)}>
                    <Text style={{ color: 'red', textAlign: 'center', fontWeight: 500 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Modal visible={showTaskModal} animationType="slide">
            <SafeAreaView style={{ flex: 1, backgroundColor: '#FFDBBE' }}>
              <ScrollView>
                <View style={styles.container}>
                  <Text style={styles.heading}>{editingTask ? 'Edit Task' : 'New Task'}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Task Name"
                    value={newTaskName}
                    onChangeText={setNewTaskName}
                  />
                  <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Assignee(s): </Text>
                  <FlatList
                    data={projectMembers[selectedProject?.id] || []}
                    keyExtractor={(emp) => emp}
                    renderItem={({ item: emp }) => (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 5,
                          backgroundColor: taskAssignees.includes(emp) ? '#aaa' : '#eee',
                          marginBottom: 10,
                          borderRadius: 10,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <TouchableOpacity
                          style={{ flex: 1 }}
                          onPress={() => {
                            setTaskAssignees((prev) =>
                              prev.includes(emp)
                                ? prev.filter((e) => e !== emp)
                                : [...prev, emp]
                            );
                          }}
                        >
                          <Text style={{ padding: 8, fontSize: 14, fontWeight: 500 }}>{emp}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  />
                  <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Type:</Text>
                  <Picker
                    selectedValue={taskType}
                    onValueChange={setTaskType}
                  >
                    {taskTypes.map((type) => (
                      <Picker.Item key={type} label={type} value={type} />
                    ))}
                  </Picker>
                  <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Status:</Text>
                  <Picker
                    selectedValue={taskStatus}
                    onValueChange={setTaskStatus}
                  >
                    {taskStatuses.map((status) => (
                      <Picker.Item key={status} label={status} value={status} />
                    ))}
                  </Picker>
                  <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Reporter:</Text>
                  <Picker
                    selectedValue={taskReporter}
                    onValueChange={setTaskReporter}
                  >
                    <Picker.Item label="Select Reporter" value="" />
                    {/* Add the project creator (manager) */}
                    {selectedProject && (() => {
                      const manager = users.find(u => u.username === selectedProject.created_by && (u.role === 'Manager' || u.role === 'Admin'));
                      return manager ? (
                        <Picker.Item key={manager.username} label={`${manager.username} (${manager.role})`} value={manager.username} />
                      ) : null;
                    })()}
                    {/* Add project members */}
                    {(projectMembers[selectedProject?.id] || [])
                      .map(username => users.find(u => u.username === username))
                      .filter(u => u && (u.role === 'Manager' || u.role === 'Employee'))
                      .map(u => (
                        <Picker.Item key={u.username} label={`${u.username} (${u.role})`} value={u.username} />
                      ))}
                  </Picker>
                  <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 20 }}>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity style={styles.cancelButton} onPress={() => {
                        setShowTaskModal(false);
                        setEditingTask(null); // <-- Reset editing
                      }}>
                        <Text style={{ color: 'red', textAlign: 'center', fontWeight: 500 }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity style={styles.saveButton} onPress={saveTask}>
                        <Text style={{ color: '#FFF', textAlign: 'center', fontWeight: 500 }}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </SafeAreaView>
          </Modal>

          <Modal visible={showUserModal} animationType="slide" transparent={false}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#FFDBBE' }}>
              <View style={styles.container}>
                <Text style={styles.heading}>Add New User</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  value={newUserName}
                  onChangeText={setNewUserName}
                />
                <Text style={{ marginVertical: 10, fontWeight: 'bold', fontSize: 18, color: '#D9534F' }}>Select Role:</Text>
                <Picker
                  selectedValue={newUserRole}
                  onValueChange={(value) => setNewUserRole(value)}
                >
                  {roles.map((r) => (
                    <Picker.Item key={r} label={r} value={r} />
                  ))}
                </Picker>
                <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 20 }}>
                  <View style={{ flex:1 }}>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setShowUserModal(false)}>
                      <Text style={{ color: 'red', textAlign: 'center', fontWeight: 500 }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex:1 }}>
                    <TouchableOpacity style={styles.saveButton} onPress={addUser}>
                      <Text style={{ color: '#FFF', textAlign: 'center', fontWeight: 500 }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </SafeAreaView>
          </Modal>

          <View style={{ flex: 1 }} />

          <View style={styles.logoutContainer}>
            <TouchableOpacity
              style={{
                backgroundColor: '#D9534F',
                padding: 10,
                borderRadius: 10,
                alignItems: 'center',
                marginVertical: 10,
              }}
              onPress={() => {
                setLoggedIn(false);
                setUsername('');
                setRole('Employee');
                setSelectedProject(null);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 500, fontSize: 16 }}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    flex: 1,
    backgroundColor: '#FFDBBE',
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 10,
    color: '#D9534F',
    textAlign: 'center',
  },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 10,
    marginTop: 10,
    marginBottom: 15,
    borderRadius: 6,
    backgroundColor: '#fff'
  },
  logoutContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  addButton: {
    backgroundColor: '#0096FF',
    padding: 10,
    borderRadius: 10,
    marginVertical: 10,
  },
  saveButton: {
    backgroundColor: '#D9534F',
    padding: 10,
    borderRadius: 10,
    marginVertical: 10,
  },
  cancelButton: {
    backgroundColor: '#EEE',
    padding: 10,
    borderRadius: 10,
    marginVertical: 10,
  },
});
