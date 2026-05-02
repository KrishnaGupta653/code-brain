// Rust test file
use std::collections::HashMap;

pub struct User {
    pub id: u32,
    pub name: String,
    pub email: String,
}

impl User {
    pub fn new(id: u32, name: String, email: String) -> Self {
        User { id, name, email }
    }

    pub fn get_display_name(&self) -> String {
        format!("{} ({})", self.name, self.email)
    }
}

pub fn create_user(name: &str, email: &str) -> User {
    User::new(1, name.to_string(), email.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_user() {
        let user = create_user("John", "john@example.com");
        assert_eq!(user.name, "John");
    }
}
